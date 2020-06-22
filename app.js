/*
  Service Variables:
  ------------------
  APP_LOGIN_USERNAME: Web dashboard username
  APP_LOGIN_PASSWORD_HASH: Web dashboard password hash as generated by passwordHasher.js
  APP_DEVICES: A comma-separated list of device UUIDs at the same location
*/

/*
____                  _
|  _ \ ___  __ _ _   _(_)_ __ ___  ___
| |_) / _ \/ _` | | | | | '__/ _ \/ __|
|  _ <  __/ (_| | |_| | | | |  __/\__ \
|_| \_\___|\__, |\__,_|_|_|  \___||___/
             |_|
*/

const {
  exec
} = require('child_process');
const schedule = require('node-schedule');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const express = require('express');
const basicAuth = require('express-basic-auth');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const fileUpload = require('express-fileupload');
const crypto = require('crypto');
const qs = require('querystring');
const dns = require('dns');

const app = express();
const adapter = new FileSync('/data/db.json');
const db = low(adapter);

/*
  ____        __             _ _
  |  _ \  ___ / _| __ _ _   _| | |_ ___
  | | | |/ _ \ |_ / _` | | | | | __/ __|
  | |_| |  __/  _| (_| | |_| | | |_\__ \
  |____/ \___|_|  \__,_|\__,_|_|\__|___/

*/

const login_username = process.env.APP_LOGIN_USERNAME || 'admin';
const login_password = process.env.APP_LOGIN_PASSWORD_HASH || 'oKBT2uSiERMmBCGDNlmNGnYKpv7zVQvL3hs3td5aeIk='; // Defaults to  'signage', use passwordHasher.js to create your own

internetConnection = true;
currentTask = 0;
JobsArray = [];

db.defaults({
  'hours': [{
    '0': {
      'open': '10:30',
      'close': '20:30'
    },
    '1': {
      'open': '10:30',
      'close': '20:30'
    },
    '2': {
      'open': '10:30',
      'close': '20:30'
    },
    '3': {
      'open': '10:30',
      'close': '20:30'
    },
    '4': {
      'open': '10:30',
      'close': '20:30'
    },
    '5': {
      'open': '10:30',
      'close': '20:30'
    },
    '6': {
      'open': '10:30',
      'close': '20:30'
    }
  }]
}).write();

/*
  _____                 _   _
  |  ___|   _ _ __   ___| |_(_) ___  _ __  ___
  | |_ | | | | '_ \ / __| __| |/ _ \| '_ \/ __|
  |  _|| |_| | | | | (__| |_| | (_) | | | \__ \
  |_|   \__,_|_| |_|\___|\__|_|\___/|_| |_|___/

*/

function timeToDb(time) {
  if (time.split(' ')[1] == 'AM') {
    return time.split(' ')[0];
  } else {
    if (parseInt(time.split(' ')[0].split(':')[0]) == 12) {
      return '12:' + time.split(' ')[0].split(':')[1];
    } else {
      return (parseInt(time.split(' ')[0].split(':')[0]) + 12) + ':' + time.split(' ')[0].split(':')[1];
    }
  }
}

function myAuthorizer(username, password) {
  const userMatches = basicAuth.safeCompare(username, login_username);
  const passwordMatches = basicAuth.safeCompare(crypto.createHash('sha256').update(password).digest('base64'), login_password);
  const hashPasswordMatches = basicAuth.safeCompare(password, login_password);
  return (userMatches & passwordMatches) || (userMatches & hashPasswordMatches);
}

function cancelAllJobs() {
  JobsArray.forEach(job => {
    job.cancel();
  });
  JobsArray = [];
  console.log('All jobs have been cancelled.');
}

function jobCheck(job, obj) {
  if (job === null) {
    console.error('Detected invalid job on schedule. Stopping...');
    console.error('INVALID JOB:');
    console.error(obj);
  } else {
    JobsArray.push(job);
  }
}

function queueJobs() {
  cancelAllJobs();
  const hours = db.get('hours');
  for (i = 0; i <= 6; i++) {
    const openHour = parseInt(hours.__wrapped__.hours[0][i].open.split(':')[0]);
    const openMin = parseInt(hours.__wrapped__.hours[0][i].open.split(':')[1]);
    const closeHour = parseInt(hours.__wrapped__.hours[0][i].close.split(':')[0]);
    const closeMin = parseInt(hours.__wrapped__.hours[0][i].close.split(':')[1]);
    // Turn TV On - 1 Hour Before Open
    const a_obj = {minute: openMin, hour: openHour - 1, dayOfWeek: i};
    const a_job = schedule.scheduleJob(a_obj, function() {
      turnTVOn();
      killOMXPlayer();
      showScreenSaver();
    });
    // Turn TV Off - 1 Hour After Close
    var newCloseHour;
    if (closeHour + 1 >= 24) {
      newCloseHour = closeHour - 23;
    } else {
      newCloseHour = closeHour + 1;
    }
    const b_obj = {minute: closeMin, hour: newCloseHour, dayOfWeek: i};
    const b_job = schedule.scheduleJob(b_obj, function() {
      turnTVOff();
      killOMXPlayer();
    });
    // Show Menu - At open
    const c_obj = {minute: openMin, hour: openHour, dayOfWeek: i};
    const c_job = schedule.scheduleJob(c_obj, function() {
      killOMXPlayer();
      showContent();
    });
    // Show screen saver - At close
    const d_obj = {minute: closeMin, hour: closeHour, dayOfWeek: i};
    const d_job = schedule.scheduleJob(d_obj, function() {
      killOMXPlayer();
      showScreenSaver();
    });

    jobCheck(a_job, a_obj);
    jobCheck(b_job, b_obj);
    jobCheck(c_job, c_obj);
    jobCheck(d_job, d_obj);
  }
  if (JobsArray.length == 28) {
    console.log('Jobs have been scheduled.');
  } else {
    console.error('Invalid number of jobs found. Found: ' + JobsArray.length + ' Expected: 28');
    cancelAllJobs();
  }
}

// Calc the current time and find out what should be happening and do it
function activateDisplay() {
  const hours = db.get('hours');
  const now = new Date();
  const dayNum = now.getDay();
  const openHour = parseInt(hours.__wrapped__.hours[0][dayNum].open.split(':')[0]);
  const openMin = parseInt(hours.__wrapped__.hours[0][dayNum].open.split(':')[1]);
  const closeHour = parseInt(hours.__wrapped__.hours[0][dayNum].close.split(':')[0]);
  const closeMin = parseInt(hours.__wrapped__.hours[0][dayNum].close.split(':')[1]);
  if (now > Date.parse((now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear() + ' ' + (openHour - 1) + ':' + openMin + ':00') && now < Date.parse((now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear() + ' ' + openHour + ':' + openMin + ':00')) {
    // 1 hour before open, play screensaver
    showScreenSaver();
  } else if (now > Date.parse((now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear() + ' ' + closeHour + ':' + closeMin + ':00') && now < Date.parse((now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear() + ' ' + (closeHour + 1) + ':' + closeMin + ':00')) {
    // 1 hour after close, play screensaver
    showScreenSaver();
  } else if (now > Date.parse((now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear() + ' ' + openHour + ':' + openMin + ':00') && now < Date.parse((now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear() + ' ' + closeHour + ':' + closeMin + ':00')) {
    // In business hours, play content
    showContent();
  } else {
    console.log('Outside active hours, doing nothing...');
  }
  queueJobs();
}

function showContent() {
  currentTask = 1;
  if (fs.existsSync('/data/contentFile.mp4')) {
    exec('omxplayer --loop --no-osd /data/contentFile.mp4', (err, stdout, stderr) => {});
  } else {
    exec('omxplayer --loop --no-osd /usr/src/app/mediaAssets/NoMedia.mp4', (err, stdout, stderr) => {});
  }
  console.log('Content has been shown.');
}

function showScreenSaver() {
  currentTask = 2;
  if (fs.existsSync('/data/screensaverFile.mp4')) {
    exec('omxplayer --loop --no-osd /data/screensaverFile.mp4', (err, stdout, stderr) => {});
  } else {
    exec('omxplayer --loop --no-osd /usr/src/app/mediaAssets/NoMedia.mp4', (err, stdout, stderr) => {});
  }
  console.log('Screensaver has been shown.');
}

function killOMXPlayer() {
  console.log('OMXPlayer has been killed.');
  exec('killall omxplayer.bin', (err, stdout, stderr) => {});
}

function turnTVOff() {
  exec('echo standby 0 | cec-client -s -d 1', (err, stdout, stderr) => {
    if (err) {
      console.error('Unable to Turn TV off: ' + stderr);
    } else {
      console.log('TV turned off.');
    }
  });
}

function turnTVOn() {
  exec('echo on 0 | cec-client -s -d 1', (err, stdout, stderr) => {
    if (err) {
      console.error('Unable to Turn TV on: ' + stderr);
    } else {
      console.log('TV turned on.');
    }
  });
}

function checkInternet() {
  var exec = require('child_process').exec, child;
  child = exec('ping -c 1 8.8.8.8', function(error, stdout, stderr) {
    if (error !== null)  {
      if (internetConnection) {
        console.error('INTERNET OFFLINE.');
        internetConnection = !internetConnection;
        exec('/usr/src/app/pngview -b 0 -d 0 -l 3 -n -x 25 -y 25 /usr/src/app/mediaAssets/noWiFi.png', (error, stdout, stderr) => {
          if (error) {
            console.error('Unable to enable no wifi overlay: ' + error);
          }
        });
      }
    } else {
      if (!internetConnection) {
        console.error('INTERNET BACK  ONLINE.');
        internetConnection = !internetConnection;
        exec('killall pngview', (err, stdout, stderr) => {});
      }
    }
  });
}

/*
__        __   _       ____
\ \      / /__| |__   / ___|  ___ _ ____   _____ _ __
 \ \ /\ / / _ \ '_ \  \___ \ / _ \ '__\ \ / / _ \ '__|
  \ V  V /  __/ |_) |  ___) |  __/ |   \ V /  __/ |
   \_/\_/ \___|_.__/  |____/ \___|_|    \_/ \___|_|

*/

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(fileUpload());
app.use('/assets', express.static(__dirname + '/public'));
app.use('/pages', express.static(__dirname + '/views'));

app.use(basicAuth({
  authorizer: myAuthorizer,
  challenge: true
}))

app.post('/forms/dashboardActions', function(req, res) {
  if (req.body.startContent == '') {
    killOMXPlayer();
    showContent();
    res.redirect('/?message=' + encodeURI('Content started.'));
  } else if (req.body.startScreensaver == '') {
    killOMXPlayer()
    showScreenSaver();
    res.redirect('/?message=' + encodeURI('Screensaver started.'));
  } else if (req.body.start == '') {
    killOMXPlayer();
    activateDisplay();
    res.redirect('/?message=' + encodeURI('Media started.'));
  } else if (req.body.stop == '') {
    killOMXPlayer();
    res.redirect('/?message=' + encodeURI('Media stopped.'));
  } else if (req.body.tvOff == '') {
    turnTVOff();
    res.redirect('/?message=' + encodeURI('TV turned off.'));
  } else if (req.body.tvOn == '') {
    turnTVOn();
    res.redirect('/?message=' + encodeURI('TV turned on.'));
  } else if (req.body.reboot == '') {
    setTimeout(function() {
      axios.post(process.env.BALENA_SUPERVISOR_ADDRESS + '/v1/reboot?apikey=' + process.env.BALENA_SUPERVISOR_API_KEY)
        .then((res) => {
          console.log('Restarting...');
        })
        .catch((error) => {
          console.error('Balena Reboot API Error: ' + error);
        })
    }, 3000);
    res.redirect('/?message=' + encodeURI('Shutting down...'));
  }
});

app.post('/forms/postHours', function(req, res) {
  console.log('Recieved updated hours.');
  var hours = {};
  hours[0] = {
    'open': timeToDb(req.body['0open']),
    'close': timeToDb(req.body['0close'])
  };
  hours[1] = {
    'open': timeToDb(req.body['1open']),
    'close': timeToDb(req.body['1close'])
  };
  hours[2] = {
    'open': timeToDb(req.body['2open']),
    'close': timeToDb(req.body['2close'])
  };
  hours[3] = {
    'open': timeToDb(req.body['3open']),
    'close': timeToDb(req.body['3close'])
  };
  hours[4] = {
    'open': timeToDb(req.body['4open']),
    'close': timeToDb(req.body['4close'])
  };
  hours[5] = {
    'open': timeToDb(req.body['5open']),
    'close': timeToDb(req.body['5close'])
  };
  hours[6] = {
    'open': timeToDb(req.body['6open']),
    'close': timeToDb(req.body['6close'])
  };
  db.get('hours').remove().write();
  db.get('hours').push(hours).write();
  queueJobs();
  if (typeof req.body['sync'] !== 'undefined' && req.body['sync'] == 'on') {
    console.log('Syncing hours...');
    var requestBody = req.body;
    delete requestBody.sync;
    var devices = [];
    const devicesText = process.env.APP_DEVICES;
    if (typeof devicesText !== 'undefined') {
      if (devicesText.indexOf(',') > -1) {
        devices = devicesText.split(',');
      } else {
        devices.push(devicesText);
      }
    }
    const index = devices.indexOf(process.env.BALENA_DEVICE_UUID);
    if (index > -1) {
      devices.splice(index, 1);
    }
    console.log(devices);
    //var messsage;
    devices.forEach(uuid => {
      axios.post('https://' + uuid + '.balena-devices.com/forms/postHours', qs.stringify(requestBody), {
          auth: {
            username: login_username,
            password: login_password
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
        .then((res) => {
          if (typeof res.statusCode !== 'undefined') {
            console.error('Error syncing hours with ' + uuid.substring(0, 7) + ': ' + res.statusCode);
            //message += 'Error syncing hours with ' + uuid.substring(0, 7) + ': ' + res.statusCode + '\n';
          } else {
            console.log('Successfully synced hours with ' + uuid.substring(0, 7));
            //message += 'Successfully synced hours with ' + uuid.substring(0, 7);
          }
        })
        .catch((error) => {
          console.error('Error syncing hours with ' + uuid.substring(0, 7) + ': ' + error);
          //message += 'Error syncing hours with ' + uuid.substring(0, 7) + ': ' + error + '\n';
        });
    });
    console.log('Done syncing...');
    /*if (typeof message !== 'undefined' && message) {
      res.redirect('/?message=' + encodeURI(message));
    } else {
      res.redirect('/');
    }*/
  }
  res.redirect('/?message=' + encodeURI('Hours successfully updated.'));
});

app.post('/upload/content', function(req, res) {
  let contentFile = req.files.contentFile;
  if (currentTask == 1) {
    killOMXPlayer();
  }
  if (fs.existsSync('/data/contentFile.mp4')) {
    fs.unlinkSync('/data/contentFile.mp4');
  }
  contentFile.mv('/data/contentFile.mp4', function(err) {
    if (err) {
      return res.redirect('/?message=' + encodeURI('Error uploading new content: ' + err));
    }
    if (currentTask == 1) {
      showContent();
    }
    res.redirect('/?message=' + encodeURI('Content successfully uploaded!'));
  });
});

app.post('/upload/screensaver', function(req, res) {
  let screensaverFile = req.files.screensaverFile;
  if (currentTask == 2) {
    killOMXPlayer();
  }
  if (fs.existsSync('/data/screensaverFile.mp4')) {
    fs.unlinkSync('/data/screensaverFile.mp4');
  }
  screensaverFile.mv('/data/screensaverFile.mp4', function(err) {
    if (err) {
      return res.redirect('/?message=' + encodeURI('Error uploading new screensaver: ' + err));
    }
    if (currentTask == 2) {
      showScreenSaver();
    }
    res.redirect('/?message=' + encodeURI('Screensaver successfully uploaded!'));
  });
});

app.get('/download/content', function(req, res) {
  if (fs.existsSync('/data/contentFile.mp4')) {
    res.download('/data/contentFile.mp4');
  } else {
    res.download('/usr/src/app/mediaAssets/NoMedia.mp4');
  }
});

app.get('/download/screensaver', function(req, res) {
  if (fs.existsSync('/data/screensaverFile.mp4')) {
    res.download('/data/screensaverFile.mp4');
  } else {
    res.download('/usr/src/app/mediaAssets/NoMedia.mp4');
  }
});

app.get('/delete/content', function(req, res) {
  if (fs.existsSync('/data/contentFile.mp4')) {
    fs.unlinkSync('/data/contentFile.mp4');
    res.redirect('/?message=' + encodeURI('Content deleted.'));
  } else {
    res.redirect('/?message=' + encodeURI('Unable to delete content: content does not exist.'));
  }
});

app.get('/delete/screensaver', function(req, res) {
  if (fs.existsSync('/data/screensaverFile.mp4')) {
    fs.unlinkSync('/data/screensaverFile.mp4');
  } else {
    res.redirect('/?message=' + encodeURI('Unable to delete screensaver: screensaver does not exist.'));
  }
});

app.get('/view.png', function(req, res) {
  const rand = Math.floor(1000 + Math.random() * 9000);
  exec('raspi2png --compression 9 --height 270 --width 480 --pngname /tmp/view_' + rand + '.png', (error, stdout, stderr) => {
    if (error) {
      res.status(500).send('Cannot execute raspi2png: ' + stderr);
    } else {
      res.sendFile('/tmp/view_' + rand + '.png');
      setTimeout(function() {
        if (fs.existsSync('/tmp/view_' + rand + '.png')) {
          fs.unlinkSync('/tmp/view_' + rand + '.png');
        }
      }, 30000);
    }
  });
});

app.get('/', function(req, res) {
  const dbHours = db.get('hours');
  const uuid = process.env.BALENA_DEVICE_UUID || 'Unknown';
  const appId = process.env.BALENA_APP_ID || 'Unknown';
  const appName = process.env.BALENA_APP_NAME || 'Unknown';
  const deviceType = process.env.BALENA_DEVICE_TYPE || 'Unknown';
  const deviceName = process.env.BALENA_DEVICE_NAME_AT_INIT || 'Unknown';
  const balenaSupervisorVersion = process.env.BALENA_SUPERVISOR_VERSION || 'Unknown';
  const hostOSVersion = process.env.BALENA_HOST_OS_VERSION || 'Unknown';
  const message = req.query.message;
  const contentValid = fs.existsSync('/data/contentFile.mp4')
  const screenSaverValid = fs.existsSync('/data/screensaverFile.mp4');

  var hours = {};
  for (i = 0; i <= 6; i++) {
    var openHour = dbHours.__wrapped__.hours[0][i].open.split(':')[0];
    const openMin = dbHours.__wrapped__.hours[0][i].open.split(':')[1];
    var closeHour = dbHours.__wrapped__.hours[0][i].close.split(':')[0];
    const closeMin = dbHours.__wrapped__.hours[0][i].close.split(':')[1];
    hours[i] = {};
    if (openHour >= 12) {
      if (openHour != 12) {
        openHour = parseInt(openHour) - 12;
      }
      hours[i].open = openHour + ':' + openMin + ' PM';
    } else {
      hours[i].open = openHour + ':' + openMin + ' AM';
    }
    if (closeHour >= 12) {
      if (closeHour != 12) {
        closeHour = parseInt(closeHour) - 12;
      }
      hours[i].close = closeHour + ':' + closeMin + ' PM';
    } else {
      hours[i].close = closeHour + ':' + closeMin + ' AM';
    }
  }
  var resVars = {
    username: req.auth.user,
    uuid: uuid,
    appId: appId,
    appName: appName,
    deviceType: deviceType,
    deviceName: deviceName,
    balenaSupervisorVersion: balenaSupervisorVersion,
    hostOSVersion: hostOSVersion,
    hours: hours,
    contentValid: contentValid,
    screenSaverValid: screenSaverValid
  }
  if (typeof message !== 'undefined' && message) {
    resVars.message = message;
  }
  res.render('dashboard', resVars);
});
app.use(function(req, res, next) {
  res.status(404).render('404');
});

/*
  ____  _             _                 ____       _
  / ___|| |_ __ _ _ __| |_ _   _ _ __   |  _ \ _ __(_)_   _____ _ __
  \___ \| __/ _` | '__| __| | | | '_ \  | | | | '__| \ \ / / _ \ '__|
   ___) | || (_| | |  | |_| |_| | |_) | | |_| | |  | |\ V /  __/ |
  |____/ \__\__,_|_|   \__|\__,_| .__/  |____/|_|  |_| \_/ \___|_|
                               |_|
*/

setInterval(function() {
  checkInternet();
}, 120 * 1000);

app.listen(80);
activateDisplay();
checkInternet();
