

const shp = require('../lib');

const pandr = shp('http://localhost:3000/files/test1.zip', null, {
  epsg: 4214
}).then(result => {
  console.log(result);
}).catch(e => console.log('ERR', e));

console.log(pandr);

