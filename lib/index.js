'use strict';
let proj4 = require('proj4');
if (proj4.default) {
  proj4 = proj4.default;
}
const { unzip, JSZip } = require('./unzip');
const binaryAjax = require('./binaryajax');
const parseShp = require('./parseShp');
const parseDbf = require('parsedbf');
const Promise = require('lie');
const Cache = require('lru-cache');
const Buffer = require('buffer').Buffer;
const URL = global.URL;
const wktParser = require('wkt-parser');
const projData = require('proj-data');
const esriEpsg = require('./esriEpsg');
const fs = require('fs');
const clientReadFile = require('./clientReadFile');

const cache = new Cache({
  max: 20
});

function toBuffer(b) {
  if (!b) {
    throw new Error('forgot to pass buffer');
  }
  if (Buffer.isBuffer(b)) {
    return b;
  }
  if (b instanceof global.ArrayBuffer) {
    return Buffer.from(b);
  }
  if (b.buffer instanceof global.ArrayBuffer) {
    if (b.BYTES_PER_ELEMENT === 1) {
      return Buffer.from(b);
    }
    return Buffer.from(b.buffer);
  }
}

function shp(base, whiteList, options) {
  if (typeof base === 'string' && cache.has(base)) {
    return Promise.resolve(cache.get(base));
  }
  return shp.getShapefile(base, whiteList, options).then(function (resp) {
    if (typeof base === 'string') {
      cache.set(base, resp);
    }
    return resp;
  });
}
shp.combine = function ([shp, dbf]) {
  const out = {};
  out.type = 'FeatureCollection';
  out.features = [];
  let i = 0;
  const len = shp.length;
  if (!dbf) {
    dbf = [];
  }
  while (i < len) {
    out.features.push({
      type: 'Feature',
      geometry: shp[i],
      properties: dbf[i] || {}
    });
    i++;
  }
  return out;
};
shp.parseZip = async function (buffer, whiteList, options) {
  let key;
  buffer = toBuffer(buffer);
  const zip = await unzip(buffer);
  const names = [];
  whiteList = whiteList || [];
  for (key in zip) {
    if (key.indexOf('__MACOSX') !== -1) {
      continue;
    }
    if (key.slice(-3).toLowerCase() === 'shp') {
      /* if (key.split('.').pop().toLowerCase() === 'shp') { */
      names.push(key.slice(0, -4));
      zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = zip[key];
    } else if (key.slice(-3).toLowerCase() === 'prj') {
      /* zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = proj4(zip[key]);    */
      let fromProj = zip[key];
      const esriPrjObj = wktParser(fromProj);
      const epsg = esriEpsg(esriPrjObj.name);

      if (epsg) {
        const prjObj = projData['EPSG:' + epsg];
        if (prjObj) {
          fromProj = prjObj.proj4;
        }
      }

      let destProj = null;
      if (options && options.epsg) {
        const prjObj = projData['EPSG:' + options.epsg];
        if (prjObj) {
          destProj = prjObj.proj4;
        }
      }

      if (destProj) {
        zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = proj4(destProj, fromProj);
      } else {
        zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = proj4(fromProj);
      }
    } else if (key.slice(-4).toLowerCase() === 'json' || whiteList.indexOf(key.split('.').pop()) > -1) {
      names.push(key.slice(0, -3) + key.slice(-3).toLowerCase());
    } else if (key.slice(-3).toLowerCase() === 'dbf' || key.slice(-3).toLowerCase() === 'cpg') {
      zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = zip[key];
    }
  }
  if (!names.length) {
    throw new Error('no layers founds');
  }
  const geojson = names.map(function (name) {
    let parsed, dbf;
    const lastDotIdx = name.lastIndexOf('.');
    if (lastDotIdx > -1 && name.slice(lastDotIdx).indexOf('json') > -1) {
      parsed = JSON.parse(zip[name]);
      parsed.fileName = name.slice(0, lastDotIdx);
    } else if (whiteList.indexOf(name.slice(lastDotIdx + 1)) > -1) {
      parsed = zip[name];
      parsed.fileName = name;
    } else {
      if (zip[name + '.dbf']) {
        let encoding = zip[name + '.cpg'];
        if (!encoding) {
          encoding = 'gb2312';
        }
        dbf = parseDbf(zip[name + '.dbf'], encoding);
      }
      parsed = shp.combine([parseShp(zip[name + '.shp'], zip[name + '.prj']), dbf]);
      parsed.fileName = name;
    }
    return parsed;
  });
  if (geojson.length === 1) {
    return geojson[0];
  } else {
    return geojson;
  }
};

async function getZip(base, whiteList, options) {
  const a = await binaryAjax(base);
  return shp.parseZip(a, whiteList, options);
}
const handleShp = async (base, options) => {
  const args = await Promise.all([
    binaryAjax(base, 'shp'),
    binaryAjax(base, 'prj')
  ]);
  let prj = false;
  try {
    if (args[1]) {
      // prj = proj4(args[1]);

      let fromProj;
      let destProj;

      const esriPrjObj = wktParser(args[1]);
      const epsg = esriEpsg(esriPrjObj.name);

      if (epsg) {
        const prjObj = projData['EPSG:' + epsg];
        if (prjObj) {
          fromProj = prjObj.proj4;
        }
      }

      if (options && options.epsg) {
        const prjObj = projData['EPSG:' + options.epsg];
        if (prjObj) {
          destProj = prjObj.proj4;
        }
      }

      if (destProj) {
        prj = proj4(destProj, fromProj);
      } else {
        prj = proj4(fromProj);
      }
    }
  } catch (e) {
    prj = false;
  }
  return parseShp(args[0], prj);
};
const handleDbf = async (base) => {
  const [dbf, cpg] = await Promise.all([
    binaryAjax(base, 'dbf'),
    binaryAjax(base, 'cpg')
  ]);
  if (!dbf) {
    return;
  }
  return parseDbf(dbf, cpg);
};
const checkSuffix = (base, suffix) => {
  const url = new URL(base);
  return url.pathname.slice(-4).toLowerCase() === suffix;
};
shp.getShapefile = async function (base, whiteList, options) {
  if (typeof base !== 'string') {
    return shp.parseZip(base);
  }
  if (checkSuffix(base, '.zip')) {
    return getZip(base, whiteList, options);
  }
  const results = await Promise.all([
    handleShp(base, options),
    handleDbf(base)
  ]);
  return shp.combine(results);
};
shp.parseShp = function (shp, prj) {
  shp = toBuffer(shp);
  if (Buffer.isBuffer(prj)) {
    prj = prj.toString();
  }
  if (typeof prj === 'string') {
    try {
      prj = proj4(prj);
    } catch (e) {
      prj = false;
    }
  }
  return parseShp(shp, prj);
};
shp.parseDbf = function (dbf, cpg) {
  dbf = toBuffer(dbf);
  return parseDbf(dbf, cpg);
};
shp.fromLocalFile = async function (filePath, options) {
  if (filePath.length >= 4 && filePath.endsWith('.shp')) {
    filePath = filePath.substring(0, filePath.length - 4);
  }

  let shpBuffer;
  let dbfBuffer;
  let fromProj;

  try {
    shpBuffer = fs.readFileSync(filePath + '.shp');
    dbfBuffer = fs.readFileSync(filePath + '.dbf');
    fromProj = fs.readFileSync(filePath + '.prj').toString();
  } catch (err) {
    console.error(err);
  }

  const esriPrjObj = wktParser(fromProj);
  const epsg = esriEpsg(esriPrjObj.name);

  if (epsg) {
    const prjObj = projData['EPSG:' + epsg];
    if (prjObj) {
      fromProj = prjObj.proj4;
    }
  }

  let destProj = null;
  if (options && options.epsg) {
    const prjObj = projData['EPSG:' + options.epsg];
    if (prjObj) {
      destProj = prjObj.proj4;
    }
  }

  let prj = null;
  if (destProj) {
    prj = proj4(destProj, fromProj);
  } else {
    prj = proj4(fromProj);
  }

  const reuslt = shp.combine([shp.parseShp(shpBuffer, prj), shp.parseDbf(dbfBuffer, options.cpg)]);

  return reuslt;
};
shp.fromClientFile = async function (shpFile, dbfFile, prjFile, options) {
  let shpBuffer;
  let dbfBuffer;
  let fromProj;

  try {
    shpBuffer = await clientReadFile(shpFile);
    dbfBuffer = await clientReadFile(dbfFile, null, options.cpg);
    fromProj = await clientReadFile(prjFile, 'text');
  } catch (err) {
    console.error(err);
  }

  const esriPrjObj = wktParser(fromProj);
  const epsg = esriEpsg(esriPrjObj.name);

  if (epsg) {
    const prjObj = projData['EPSG:' + epsg];
    if (prjObj) {
      fromProj = prjObj.proj4;
    }
  }

  let destProj = null;
  if (options && options.epsg) {
    const prjObj = projData['EPSG:' + options.epsg];
    if (prjObj) {
      destProj = prjObj.proj4;
    }
  }

  let prj = null;
  if (destProj) {
    prj = proj4(destProj, fromProj);
  } else {
    prj = proj4(fromProj);
  }

  const reuslt = shp.combine([shp.parseShp(shpBuffer, prj), shp.parseDbf(dbfBuffer, options.cpg)]);

  return reuslt;
};
shp.jsZip = JSZip;
shp.proj4 = proj4;
shp.esriEpsg = esriEpsg;

module.exports = shp;
