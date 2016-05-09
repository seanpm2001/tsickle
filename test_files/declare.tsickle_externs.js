/** @externs */
/** @const */
var DeclareTestModule = {};
/** @const */
DeclareTestModule.inner = {};
 /** @type {boolean} */
DeclareTestModule.inner.someBool;
/** @record @struct */
DeclareTestModule.Foo = function() {};
 /** @type {string} */
DeclareTestModule.Foo.prototype.field;

/**
 * @param {string} a
 * @return {number}
 */
DeclareTestModule.Foo.prototype.method = function(a) {};

/**
 * @constructor
 * @struct
 * @param {number} a
 */
DeclareTestModule.Clazz = function(a) {};

/**
 *  Comment
 * @param {string} a
 * @return {number}
 */
DeclareTestModule.Clazz.prototype.method = function(a) {};
/** @record @struct */
DeclareTestModule.NotYetHandled = function() {};

/** @const */
DeclareTestModule.Enumeration = {};
/** @const {number} */
DeclareTestModule.Enumeration.Value1;
/** @const {number} */
DeclareTestModule.Enumeration.Value3;
 /** @type {number} */
var declareGlobalVar;

/**
 * @param {string} x
 * @return {number}
 */
function declareGlobalFunction(x) {}
/** @record @struct */
function DeclareTestInterface() {}
 /** @type {string} */
DeclareTestInterface.prototype.foo;
