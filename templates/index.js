// templates/index.js
//const t1 = require("./t1");
//const t2 = require("./t2");

//module.exports = function getTemplate(templateId, vars = {}) {
//  const id = String(templateId || "t1").toLowerCase();
//
//  if (id === "t2") return t2(vars);
//  return t1(vars); // default
//};

// templates/index.js
const t2 = require("./t2");
const t11 = require("./t11"); // test version acting as t1

module.exports = function getTemplate(templateId, vars = {}) {
  const id = String(templateId || "t1").toLowerCase();

  if (id === "t2") return t2(vars);

  // ALIAS: treat t1 as t11 while testing
  if (id === "t1") return t11(vars);

  // optional: allow calling t11 explicitly too
  if (id === "t11") return t11(vars);

  // fallback
  return t11(vars);
};
