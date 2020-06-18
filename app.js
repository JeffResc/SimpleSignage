/*
  Service Variables:
  ------------------
  APP_LOGIN_USERNAME: Web dashboard username
  APP_LOGIN_PASSWORD_HASH: Web dashboard password hash as generated by passwordHasher.js
  APP_DEVICES: A comma seperated list of device UUIDs at the same location
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

const app = express();
const adapter = new FileSync('/data/db.json');
const db = low(adapter);

const login_username = process.env.APP_LOGIN_USERNAME || 'admin';
const login_password = process.env.APP_LOGIN_PASSWORD_HASH || 'oKBT2uSiERMmBCGDNlmNGnYKpv7zVQvL3hs3td5aeIk=';  // Defaults to  'signage', use passwordHasher.js to create your own

currentTask = 0;

db.defaults({
  "hours": [{
    "0": {
      "open": "10:30",
      "close": "20:30"
    },
    "1": {
      "open": "10:30",
      "close": "20:30"
    },
    "2": {
      "open": "10:30",
      "close": "20:30"
    },
    "3": {
      "open": "10:30",
      "close": "20:30"
    },
    "4": {
      "open": "10:30",
      "close": "20:30"
    },
    "5": {
      "open": "10:30",
      "close": "20:30"
    },
    "6": {
      "open": "10:30",
      "close": "20:30"
    }
  }]
}).write()

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
    console.log("Outside active hours, doing nothing...");
  }
}

function showContent() {
  currentTask = 1;
  if (fs.existsSync("/data/contentFile.mp4")) {
    exec('omxplayer --loop --no-osd /data/contentFile.mp4', (err, stdout, stderr) => {});
  } else {
    exec('omxplayer --loop --no-osd /usr/src/app/mediaAssets/NoMediaFound.mp4', (err, stdout, stderr) => {});
  }
}

function showScreenSaver() {
  currentTask = 2;
  if (fs.existsSync("/data/screensaverFile.mp4")) {
    exec('omxplayer --loop --no-osd /data/screensaverFile.mp4', (err, stdout, stderr) => {});
  } else {
    exec('omxplayer --loop --no-osd /usr/src/app/mediaAssets/NoMediaFound.mp4', (err, stdout, stderr) => {});
  }
}

function killOMXPlayer() {
  console.log("OMXPlayer has been killed.");
  exec('killall omxplayer.bin', (err, stdout, stderr) => {});
}

function turnTVOff() {
  exec('echo standby 0 | cec-client -s -d 1', (err, stdout, stderr) => {
    if (err) {
      console.log('Unable to Turn TV off: ' + stderr);
      return;
    }
  });
}

function turnTVOn() {
  exec('echo on 0 | cec-client -s -d 1', (err, stdout, stderr) => {
    if (err) {
      console.log('Unable to Turn TV on: ' + stderr);
      return;
    }
  });
}

function cancelAllJobs() {
	i = 1;
	while (typeof schedule.scheduledJobs['<Anonymous Job '+i+'>'] !== 'undefined') {
		schedule.scheduledJobs['<Anonymous Job '+i+'>'].cancel();
	  i++;
	}
	console.log('All scheduled jobs have been canceled.');
}

function queueJobs() {
  var hours = db.get('hours');
  for (i = 0; i <= 6; i++) {
    var openHour = hours.__wrapped__.hours[0][i].open.split(':')[0];
    var openMin = hours.__wrapped__.hours[0][i].open.split(':')[1];
    var closeHour = hours.__wrapped__.hours[0][i].close.split(':')[0];
    var closeMin = hours.__wrapped__.hours[0][i].close.split(':')[1];
    // Turn TV On - 1 Hour Before Open
    schedule.scheduleJob({hour: (parseInt(openHour) - 1), minute: openMin, dayOfWeek: hours.__wrapped__.hours[0][i]}, function() {
      turnTVOn();
      killOMXPlayer();
      showScreenSaver();
    });
    // Turn TV Off - 1 Hour After Close
    schedule.scheduleJob({hour: (parseInt(closeHour) + 1), minute: closeMin, dayOfWeek: hours.__wrapped__.hours[0][i]}, function() {
      turnTVOff();
      killOMXPlayer();
    });
    // Show Menu - At open
    schedule.scheduleJob({hour: openHour, minute: openMin, dayOfWeek: hours.__wrapped__.hours[0][i]}, function() {
      killOMXPlayer();
      showContent();
    });
    // Show screen saver - At close
    schedule.scheduleJob({hour: closeHour, minute: closeMin, dayOfWeek: hours.__wrapped__.hours[0][i]}, function() {
      killOMXPlayer();
      showScreenSaver();
    });
  }
}
queueJobs();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(fileUpload());
app.use('/assets', express.static(__dirname + '/public'));
app.use('/pages', express.static(__dirname + '/views'));

function myAuthorizer(username, password) {
    const userMatches = basicAuth.safeCompare(username, login_username);
    const passwordMatches = basicAuth.safeCompare(crypto.createHash("sha256").update(password).digest("base64"), login_password);
    const hashPasswordMatches = basicAuth.safeCompare(password, login_password);

    return (userMatches & passwordMatches) || (userMatches & hashPasswordMatches);
}
app.use(basicAuth( { authorizer: myAuthorizer, challenge: true } ))

app.post('/forms/dashboardActions', function(req, res) {
  if (req.body.startContent == '') {
    killOMXPlayer();
    showContent();
    res.redirect("/");
  } else if (req.body.startScreensaver == '') {
    killOMXPlayer()
    showScreenSaver();
    res.redirect("/");
  } else if (req.body.start == '') {
    killOMXPlayer()
    activateDisplay();
    res.redirect("/");
  } else if (req.body.stop == '') {
    killOMXPlayer();
    res.redirect("/");
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
    res.redirect("/?processing=1");
  }
});

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

app.post('/forms/postHours', function(req, res) {
  var hours = {};
  hours[0] = {
    "open": timeToDb(req.body['0open']),
    "close": timeToDb(req.body['0close'])
  };
  hours[1] = {
    "open": timeToDb(req.body['1open']),
    "close": timeToDb(req.body['1close'])
  };
  hours[2] = {
    "open": timeToDb(req.body['2open']),
    "close": timeToDb(req.body['2close'])
  };
  hours[3] = {
    "open": timeToDb(req.body['3open']),
    "close": timeToDb(req.body['3close'])
  };
  hours[4] = {
    "open": timeToDb(req.body['4open']),
    "close": timeToDb(req.body['4close'])
  };
  hours[5] = {
    "open": timeToDb(req.body['5open']),
    "close": timeToDb(req.body['5close'])
  };
  hours[6] = {
    "open": timeToDb(req.body['6open']),
    "close": timeToDb(req.body['6close'])
  };
  db.get('hours').remove().write();
  db.get('hours').push(hours).write();
  cancelAllJobs();
  queueJobs();
  if (typeof req.body['sync'] !== 'undefined' && req.body['sync'] == 'on') {
    console.log('Syncing hours...');
    var newBody = req.body;
    delete newBody.sync;
    var devices = [];
    const devicesText =  process.env.APP_DEVICES;
    if (typeof devicesText !== 'undefined')  {
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
    const token = Buffer.from(`${login_username}:${login_password}`, 'utf8').toString('base64');
    newBody.headers = {
      'Authorization': `Basic ${token}`
    };
    devices.forEach(uuid =>  {
      axios.post('https://' + uuid + '.balena-devices.com/forms/postHours', newBody)
      .then((res) => {
        console.log('Synced hours with ' + uuid + ', code: ' + res.statusCode);
      })
      .catch((error) => {
        console.error('Error syncing hours with ' + uuid + ': ' + error);
      });
    });
  }
  console.log('Done syncing...');
  res.redirect('/');
});

app.post('/upload/content', function(req, res) {
  let contentFile = req.files.contentFile;
	if (currentTask == 1) {
    killOMXPlayer();
  }
  if (fs.existsSync("/data/contentFile.mp4")) {
    fs.unlinkSync('/data/contentFile.mp4');
  }
  contentFile.mv('/data/contentFile.mp4', function(err) {
    if (err) {
			return res.status(500).send(err);
		}
    if (currentTask == 1) {
      showContent();
    }
		res.redirect('/');
  });
});

app.post('/upload/screensaver', function(req, res) {
  let screensaverFile = req.files.screensaverFile;
  if (currentTask == 2) {
    killOMXPlayer();
  }
  if (fs.existsSync("/data/screensaverFile.mp4")) {
    fs.unlinkSync('/data/screensaverFile.mp4');
  }
  screensaverFile.mv('/data/screensaverFile.mp4', function(err) {
    if (err) {
			return res.status(500).send(err);
		}
    if (currentTask == 2) {
      showScreenSaver();
    }
		res.redirect('/');
  });
});


app.get('/view.png', function(req, res) {
  const rand = Math.floor(1000 + Math.random() * 9000);
  exec("raspi2png --compression 9 --height 270 --width 480 --pngname /tmp/view_" + rand + ".png", (error, stdout, stderr) => {
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
  var dbHours = db.get('hours');
  const uuid = process.env.BALENA_DEVICE_UUID || 'Unknown';
  const appId = process.env.BALENA_APP_ID || 'Unknown';
  const appName = process.env.BALENA_APP_NAME || 'Unknown';
  const deviceType = process.env.BALENA_DEVICE_TYPE || 'Unknown';
  const balenaSupervisorVersion = process.env.BALENA_SUPERVISOR_VERSION || 'Unknown';
  const hostOSVersion = process.env.BALENA_HOST_OS_VERSION || 'Unknown';
  const processing = req.query.processing || 0;
  var bussHours = {};
  for (i = 0; i <= 6; i++) {
    var openHour = dbHours.__wrapped__.hours[0][i].open.split(':')[0];
    const openMin = dbHours.__wrapped__.hours[0][i].open.split(':')[1];
    var closeHour = dbHours.__wrapped__.hours[0][i].close.split(':')[0];
    const closeMin = dbHours.__wrapped__.hours[0][i].close.split(':')[1];
    bussHours[i] = {};
    if (openHour >= 12) {
      if (openHour != 12) {
        openHour = parseInt(openHour) - 12;
      }
      bussHours[i].open = openHour + ':' + openMin + ' PM';
    } else {
      bussHours[i].open = openHour + ':' + openMin + ' AM';
    }
    if (closeHour >= 12) {
      if (closeHour != 12) {
        closeHour = parseInt(closeHour) - 12;
      }
      bussHours[i].close = closeHour + ':' + closeMin + ' PM';
    } else {
      bussHours[i].close = closeHour + ':' + closeMin + ' AM';
    }
  }
  res.render('dashboard', {
    username: req.auth.user,
    uuid: uuid,
    appId: appId,
    appName: appName,
    deviceType: deviceType,
    balenaSupervisorVersion: balenaSupervisorVersion,
    hostOSVersion: hostOSVersion,
    hours: bussHours,
    processing: processing
  });
});
app.use(function(req, res, next) {
  res.status(404).render('404');
});
app.listen(80);
activateDisplay();
