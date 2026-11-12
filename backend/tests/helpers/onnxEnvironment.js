// Jest runs each test file in its own sandbox with its own Float32Array type.
// onnxruntime-node's native code returns Node's real typed arrays, which then
// fail ONNX Runtime's "instanceof Float32Array" check. This environment gives
// the sandbox Node's real typed array types.
const { TestEnvironment } = require("jest-environment-node");

const TYPED_ARRAYS = [
  "Float32Array", "Float64Array", "Int8Array", "Uint8Array", "Uint8ClampedArray",
  "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "BigInt64Array", "BigUint64Array",
];

class OnnxEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const name of TYPED_ARRAYS) this.global[name] = globalThis[name];
  }
}

module.exports = OnnxEnvironment;
