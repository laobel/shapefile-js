
module.exports = clientReadFile;
function clientReadFile(file, type = 'binary', cpg = 'utf-8') {
  return new Promise(function (resolve, reject) {
    try {
      const fileReader = new FileReader();
      fileReader.onload = function (e) {
        const contents = e.target.result;
        return resolve(contents);
      };
      if (type === 'text') {
        fileReader.readAsText(file, cpg);
      } else if (type === 'blob') {
        fileReader.readAsDataURL(file);
      } else {
        fileReader.readAsArrayBuffer(file, cpg);
      }
    } catch (err) {
      return reject(err);
    }
  });
}
