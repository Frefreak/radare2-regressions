const get = require('simple-get');
const path = require('path');
const colors = require('colors');
const fs = require('fs');

const travisUrl = 'https://api.travis-ci.org';
const travisPath = 'radare/radare2';

async function travis(api, root, cb) {
  return new Promise((resolve, reject) => {
    const url = root
    ? [travisUrl, 'repos', travisPath, api].join('/')
    : [travisUrl, api].join('/');
    get.concat(url, (err, res, data) => { 
      if (err) {
        return reject(err);
      }
      const msg = data.toString();
      try {
        resolve(JSON.parse(msg));
      } catch (err) {
        resolve(msg);
      }
    });
  });
}

function parseLogs(log) {
  const obj = {
    txt: '',
    fx: 0,
    xx: 0,
    br: 0,
    issues: []
  };
  if (log) {
    let issue = '';
    let issueFound = false;
    let last = '';
    for (let line of log.split('\n')) {
      const plain = line.replace(/\033\[..m/g, '');
      if (line.length === 0) {
        continue;
      }
      if (plain.indexOf('FX]') !== -1) {
        obj.fx++;
      }
      if (plain.indexOf('XX]') !== -1) {
        obj.xx++;
        if (line.indexOf('XX]' !== -1)) {
          const w = last.split(' ').slice(5).join(' ');
          // console.log('   ' + line + colors.yellow(w));
          obj.issues.push(line + colors.yellow(w));
        } else {
          const w = line.split(' ');
          // console.log('   ' + w[0]);
          obj.issues.push(w[0]);
        }
      } else if (plain.indexOf('BR]') !== -1) {
        obj.br++;
      }
      last = line;
    }
  }
  return obj;
}

async function processJob(job) {
  console.log(colors.green(`[BUILD] ${job.id} (${job.state}) ${job.message}`));
  console.log(colors.yellow(`[-----] ${job.id} ${job.started_at} ${job.commit}`));
  const buildInfo = await travis('builds/' + job.id, false);
  for (let job of buildInfo.matrix) {
    try {
      fs.mkdirSync('tmp');
    } catch (e) {
    }
    const logFile = 'tmp/log-' + job.id + '.txt';
    const logExists = fs.existsSync(logFile);
    const travisLog = logExists
      ? { log: fs.readFileSync(logFile).toString() }
      : await travis(`jobs/${job.id}`, false);
    const log = (travisLog && travisLog.log)? travisLog.log.replace(/\r/g, '\n'): '';
    const result = parseLogs(log);
    const status = job.finished_at === null? '(running)': '(finished)';
    if (!logExists && job.finished_at) {
      fs.writeFileSync(logFile, log);
    }
    console.log('  [JOB]', job.id, 'XX:', result.xx, 'BR:', result.br, 'FX:', result.fx, status);
    for (let issue of result.issues) {
      console.log('  ', issue);
    }
  }
}

async function main(opts) {
  try {
    const builds = await travis('builds', true);
    let lastBuild;
    let limit = (typeof opts === 'object')? opts.limit: opts;
    for (let build of builds) {
      await processJob(build);
      if (--limit === 0) {
        break;
      }
    }
  } catch (err) {
    console.error('Oops' , err);
  }
}

module.exports = function (opts) {
return main(opts);
}
