/**
 * 简单的GBK解码函数
 * @param {Buffer} buffer - GBK编码的缓冲区
 * @returns {string} UTF-8字符串
 */
function simpleDecode(buffer) {
  if (buffer.length === 0) {
    return "";
  }
  const decoder = new TextDecoder("gbk");
  return decoder.decode(buffer);
}

module.exports = {
  simpleDecode,
};
