//require('dotenv').config();
const { DATABASE_URL, PORT } = require('./config');
const { User } = require('./models')
const path = require('path');
const express = require('express');
const passport = require('passport');
const mongoose = require('mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const BearerStrategy = require('passport-http-bearer').Strategy;
const socketRooms = require('./socket').socketRooms;
const multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs');

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (process.env.NODE_ENV != 'production') {
      cb(null, '../client/public/samples/mic')
    }
    else {
      cb(null, path.resolve(__dirname, '../client/public/samples/mic'))
    }
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
});

const upload = multer({ storage: storage });


mongoose.Promise = global.Promise

let keys = {
  googleplus: {
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET
  }
}

// Removing this check for production, don't need to connect to any db.

//if (process.env.NODE_ENV != 'production') {
//  keys = require('./secret');
//}

const app = express();
// app.use(passport.initialize());

// passport.use(
//   new GoogleStrategy({
//     clientID: keys.googleplus.CLIENT_ID,
//     clientSecret: keys.googleplus.CLIENT_SECRET,
//     callbackURL: `/api/auth/google/callback`
//   },
//     (accessToken, refreshToken, profile, cb) => {
//       User
//         .findOneAndUpdate({
//           googleId: profile.id,
//           displayName: profile.displayName
//         },
//         {
//           $set: {
//             accessToken: accessToken,
//             googleId: profile.id
//           }
//         }, {
//           upsert: true,
//           new: true
//         })
//         .then((user) => {
//           return cb(null, user);
//         })
//         .catch((err) => {
//           console.error(err)
//         })
//     }
//   ));

// passport.use(
//   new BearerStrategy(
//     (token, done) => {
//       User
//         .findOne({ accessToken: token })
//         .then((user) => {
//           if (user) {
//             return done(null, user);
//           }
//         })
//         .catch((err) => {
//           console.error(err)
//         })
//     }
//   )
// );

app.get('/api/auth/google',
  passport.authenticate('google', {
    scope: ['profile']
  }));

app.get('/api/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/',
    session: false
  }),
  (req, res) => {
    res.cookie('accessToken', req.user.accessToken, { expires: 0 });
    res.redirect('/');
  }
);

app.get('/api/auth/logout', (req, res) => {
  req.logout();
  res.clearCookie('accessToken');
  res.redirect('/');
});

app.get('/api/me',
  passport.authenticate('bearer', { session: false }),
  (req, res) => res.json({
    googleId: req.user.googleId,
    displayName: req.user.displayName
  })
);

app.use(express.static('audioupload'));
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(
  bodyParser.raw({ type: 'audio/ogg', limit: '50mb' })
);

app.post('/api/audioupload', upload.single('mic'), function (req, res, next) {
  try {
    let obj = req.file;
    let sliceString = obj.originalname.substr(0, obj.originalname.indexOf('_'))
    let splitFileName = sliceString.split('_')
    res.status(201).json(sliceString)
  }
  catch (e) {
    console.log(e)
    res.sendStatus(400);
  }
});


// Serve the built client
app.use(express.static(path.resolve(__dirname, '../client/build')));

// Unhandled requests which aren't for the API should serve index.html so
// client-side routing using browserHistory can function
app.get(/^(?!\/api(\/|$))/, (req, res) => {
  const index = path.resolve(__dirname, '../client/build', 'index.html');
  res.sendFile(index);
});

let server;

// UPDATE 10/28/2021  Note: Bypass checking database and run the http server.
const nodeServer = require('http').createServer(app);
const io = require('socket.io')(nodeServer);
socketRooms(io);

nodeServer.listen(PORT, () => {
  console.log(`Socket serever is running on ${PORT}`);
});

function runServer(PORT) {
  // return new Promise((resolve, reject) => {
  //   mongoose.connect(process.env.DATABASE_URL, err => {
  //     if (err) {
  //       return reject(err);
  //     }
  //     const nodeServer = require('http').createServer(app);
  //     const io = require('socket.io')(nodeServer);
  //     socketRooms(io);
  //     server = nodeServer.listen(PORT, () => {
  //       resolve();
  //     })
  //       .on('error', (err) => {
  //         mongoose.disconnect();
  //         reject(err);
  //       });
  //   });
  // });
}

function closeServer() {
  // return mongoose.disconnect().then(() => {
  //   return new Promise((resolve, reject) => {
  //     server.close((err) => {
  //       if (err) {
  //         return reject(err);
  //       }
  //       resolve();
  //     });
  //   });
  // });
}

// if (require.main === module) {
//   runServer(PORT).catch(err => console.error(err));
// }

module.exports = {
  app, runServer, closeServer
};
