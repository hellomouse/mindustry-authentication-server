// @ts-check
const fs = require('fs');
const fsP = fs.promises;
const path = require('path');
const childProcess = require('child_process');
require('dotenv').config();

// this script will set the homepage property in the app's package.json and build
async function main() {
  let baseUrl = process.env.BASE_URL;
  if (!baseUrl) return console.error('Please set BASE_URL first!');

  let appPackageFile = await fsP.readFile('./app/package.json');
  let appPackage = JSON.parse(appPackageFile.toString());
  appPackage.homepage = baseUrl;
  await fsP.writeFile('./app/package.json', JSON.stringify(appPackage, null, 2));
  console.log('Set homepage:', baseUrl);

  childProcess.spawn('npm', ['run', 'build'], {
    cwd: path.resolve('./app'),
    stdio: 'inherit'
  });
}
main();
