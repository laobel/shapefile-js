
// const shpjs = require('../lib');
const shp = require('../');

async function testShpfile() {
  console.log(shp)
  const pandr = await shp.fromLocalFile('E:\\Temp\\DM-svr\\Export_Output', {
    epsg: 4326
  });

  console.log(pandr);
}

testShpfile();