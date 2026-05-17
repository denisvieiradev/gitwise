const spinner = {
  start: function () { return this; },
  stop: function () { return this; },
  succeed: function () { return this; },
  fail: function () { return this; },
  info: function () { return this; },
  warn: function () { return this; },
  text: "",
};

export default function ora() {
  return spinner;
}
