const fs = require("fs"); //檔案系統
const jsonfile = require('jsonfile')
const config = fs.existsSync("./config.json") ? jsonfile.readFileSync("./config.json") : false; // 設定檔
const package = require("./package.json"); // 設定檔
const schedule = require("node-schedule"); // 很會計時ㄉ朋友
const pokaLog = require("./log"); // 可愛控制台輸出
const base64 = require("base-64");
const path = require('path');
const git = require("simple-git/promise")(__dirname);
const passwordHash = require('password-hash');
//express
const express = require("express");
const FileStore = require("session-file-store")(require("express-session")); // session
const session = require("express-session")({
    store: new FileStore({
        reapInterval: -1
    }),
    secret: config ? config.PokaPlayer.sessionSecret : "no config.json",
    resave: true,
    saveUninitialized: true,
    cookie: {
        expires: new Date(Date.now() + 60 * 60 * 1000 * 24 * 7)
    }
});
const helmet = require("helmet"); // 防範您的應用程式出現已知的 Web 漏洞
const bodyParser = require("body-parser"); // 讀入 post 請求
const app = express(); // Node.js Web 架構
const server = require("http").createServer(app),
    io = require("socket.io").listen(server),
    sharedsession = require("express-socket.io-session");

// 資料模組 or 連線測試模組
if (config)
    app.use("/pokaapi", require("./dataModule.js"));
if (!config || config.PokaPlayer.debug)
    app.use("/installapi", require("./checkConnection.js"));

//
app.set("views", __dirname + "/views");
app.set("view engine", "pug");
app.use(bodyParser.urlencoded({
    extended: true
}));
// SASS 好朋友
if (config && config.PokaPlayer.debug) {
    app.use(require('cors')({
        credentials: true,
        origin: 'http://localhost:8080'
    }))
    app.use(require('node-sass-middleware')({
        src: __dirname + '/public/sass',
        dest: __dirname + '/public/css',
        sourceMap: __dirname + '/public/css/pokaplayer.map',
        outputStyle: 'compressed',
        indentedSyntax: true,
        prefix: '/css'
    }));
}
app.use(helmet());
app.use(helmet.hidePoweredBy({
    setTo: 'PHP 4.2.0'
}))
app.use(session);
io.use(
    sharedsession(session, {
        autoSave: true
    })
);
// 檢查 branch
if (config) {
    git.raw(["symbolic-ref", "--short", "HEAD"]).then(branch => {
        branch = branch.slice(0, -1); // 結果會多一個換行符
        if (branch != (config.PokaPlayer.debug ? "dev" : "master")) {
            git.raw(["config", "--global", "user.email", '"you@example.com"'])
                .then(() => git.fetch(["--all"]))
                .then(() =>
                    git.reset(["--hard", "origin/" + (config.PokaPlayer.debug ? "dev" : "master")])
                )
                .then(() => git.checkout(config.PokaPlayer.debug ? "dev" : "master"))
                .then(() => process.exit())
                .catch(err => {
                    console.error("failed: ", err);
                    socket.emit("err", err.toString());
                });
        }
    });
}

// 時間處理
const moment = require("moment-timezone");
moment.locale("zh-tw");
moment.tz.setDefault("Asia/Taipei");


// 啟動囉
server.listen(3000, () => {
    pokaLog.log('PokaPlayer', package.version)
    if (config && config.PokaPlayer.debug)
        pokaLog.log('INFO', 'Debug Mode')
    pokaLog.log('INFO', 'http://localhost:3000/')
    pokaLog.log('TIME', moment().format("YYYY/MM/DD HH:mm:ss"))
    if (!config) {
        pokaLog.log('INSTALL', `未讀取到 config.json，請訪問 /install`)
        pokaLog.log('INSTALL', `或是使用 config-simple.json 來建立設定檔`)
    }
});
//安裝頁面
if (!config || config.PokaPlayer.debug)
    app.get("/install", (req, res) => res.render("install", {
        version: package.version
    }));

function verifyPassword(password) {
    /*
    驗證密碼是否正確
    */
    if (!config) return true
    if (config.PokaPlayer.passwordSwitch) { //開啟密碼登入
        if (passwordHash.isHashed(config.PokaPlayer.password)) {
            if (passwordHash.isHashed(password)) {
                return config.PokaPlayer.salt + password == config.PokaPlayer.password
            } else {
                return passwordHash.verify(config.PokaPlayer.salt + password, config.PokaPlayer.password)
            }
        } else if (passwordHash.isHashed(password)) {
            return passwordHash.verify(config.PokaPlayer.salt + config.PokaPlayer.password, password)
        } else {
            return password == config.PokaPlayer.password
        }
    } else { //未開啟密碼登入
        return true
    }
}

// 登入
app
    .get("/login/", (req, res) => {
        if (!config) {
            res.redirect("/install/");
        } else {
            verifyPassword(req.session.pass) ? res.render("login") : res.redirect("/")
        }
    })
    .post("/login/", (req, res) => {
        req.session.pass = req.body["userPASS"];
        if (verifyPassword(req.body["userPASS"])) {
            req.session.pass = passwordHash.generate(config.PokaPlayer.salt + req.body["userPASS"])
            res.send("success");
        } else {
            res.send("fail");
        }
    })
    .get("/logout/", (req, res) => {
        // 登出
        req.session.pass = ''
        res.redirect("/")
    });
//首頁
app.get("/", (req, res) => {
    if (!config) {
        res.redirect("/install/");
    } else {
        res.sendFile(path.join(__dirname + '/public/index.html'))
    }
})

// 設定 js icon css 目錄
app.use(express.static("public"));

// PONG
app.get("/ping", (req, res) => res.send("PONG"));

// 取得狀態
app.get("/status", async (req, res) => res.json({
    login: verifyPassword(req.session.pass),
    install: config,
    version: package.version,
    debug: config && config.PokaPlayer.debug ?
        (await git.raw(["rev-parse", "--short", "HEAD"])).slice(0, -1) : false
}));

// 沒設定檔給設定頁面，沒登入給登入頁
app.use((req, res, next) => {
    if (!config)
        res.redirect("/install/");
    else if (!verifyPassword(req.session.pass))
        res.redirect("/login/");
    else next();
});

io.on("connection", socket => {
    socket.emit("hello");
    // Accept a login event with user's data
    socket.on("login", userdata => {
        socket.handshake.session.userdata = userdata;
        socket.handshake.session.save();
    });
    socket.on("logout", userdata => {
        if (socket.handshake.session.userdata) {
            delete socket.handshake.session.userdata;
            socket.handshake.session.save();
        }
    });
    socket.on("update", userdata => {
        if (socket.handshake.session.pass == config.PokaPlayer.password) {
            socket.emit("init");
            git.reset(["--hard", "HEAD"])
                .then(() => socket.emit("git", "fetch"))
                .then(() => git.remote(["set-url", "origin", "https://github.com/gnehs/PokaPlayer.git"]))
                .then(() => git.pull())
                .then(() => socket.emit("git", "reset"))
                .then(() => socket.emit("restart"))
                .then(async () => {
                    const delay = interval => {
                        return new Promise(resolve => {
                            setTimeout(resolve, interval);
                        });
                    };
                    await delay(3000)
                })
                .then(() => process.exit())
                .catch(err => {
                    console.error("failed: ", err);
                    socket.emit("err", err.toString());
                });
        } else {
            socket.emit("Permission Denied Desu");
        }
    });
});
// 更新
app.get("/upgrade", (req, res) => {
    if (!config.PokaPlayer.instantUpgradeProcess) {
        git.raw(["config", "--global", "user.email", '"you@example.com"'])
            .then(() => git.fetch(["--all"]))
            .then(() =>
                git.reset(["--hard", "origin/" + (config.PokaPlayer.debug ? "dev" : "master")])
            )
            .then(() => git.checkout(config.PokaPlayer.debug ? "dev" : "master"))
            .then(() => process.exit())
            .catch(err => {
                console.error("failed: ", err);
                socket.emit("err", err.toString());
            });
    } else {
        res.send("socket");
    }
});

// get info
app.get("/info", async (req, res) => {
    let _p = package
    _p.debug = config.PokaPlayer.debug ?
        (await git.raw(["rev-parse", "--short", "HEAD"])).slice(0, -1) :
        false
    res.json(_p)
});

app.post("/restart", (req, res) => {
    res.send("k");
    process.exit();
});

app.use((req, res, next) => {
    if (!config)
        res.redirect("/install/");
    else
        res.sendFile(path.join(__dirname + '/public/index.html'))
});
// 報錯處理
process.on("uncaughtException", err => {
    if (config && config.PokaPlayer.debug) console.log(err);
});