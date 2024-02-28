
const shpjs = require('../lib');

function testzip() {
  const pandr = shp('http://localhost:3000/files/test1.zip', null, {
    epsg: 4214
  }).then(result => {
    console.log(result);
  }).catch(e => console.log('ERR', e));
}

async function testShp() {
  const pandr = await shpjs.shp('http://localhost:3000/test/data/testLine', null, {
    epsg: 4543
  }).then(result => {
    console.log(result);
  }).catch(e => console.log('ERR', e));

  console.log(pandr);
}

async function testShpfile() {
  const pandr = await shpjs.shp.fromLocalFile('E:\\develop\\JS\\shapefile-js\\test\\data\\testLine', {
    epsg: 4326
  });

  console.log(pandr);
}

testShp()