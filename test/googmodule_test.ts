/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as path from 'path';
import * as ts from 'typescript';

import * as cliSupport from '../src/cli_support';
import * as googmodule from '../src/googmodule';
import {ModulesManifest} from '../src/modules_manifest';

import * as testSupport from './test_support';

function processES5(fileName: string, content: string, {
  isES5 = true,
} = {}) {
  const options = Object.assign({}, testSupport.compilerOptions);
  options.outDir = 'fakeOutDir';
  const rootDir = options.rootDir!;
  options.target = isES5 ? ts.ScriptTarget.ES5 : options.target;
  fileName = path.join(rootDir, fileName);
  const tsHost =
      testSupport.createSourceCachingHost(new Map([[fileName, content]]));


  const host: googmodule.GoogModuleProcessorHost = {
    fileNameToModuleId: (fn: string) => path.relative(rootDir, fn),
    pathToModuleName: (context, fileName) =>
        testSupport.pathToModuleName(rootDir, context, fileName),
    options,
    moduleResolutionHost: tsHost,
    transformDynamicImport: 'closure',
  };
  const program = ts.createProgram([fileName], options, tsHost);
  // NB: this intentionally only checks for syntactical issues, but allows
  // semantic issues, such as missing imports to make the tests below easier to
  // write.
  expect(testSupport.formatDiagnostics(program.getSyntacticDiagnostics()))
      .toBe('');
  const typeChecker = program.getTypeChecker();
  const diagnostics: ts.Diagnostic[] = [];
  const manifest = new ModulesManifest();
  let output: string|null = null;
  const transformers = {
    after: [googmodule.commonJsToGoogmoduleTransformer(
        host, manifest, typeChecker)]
  };
  const res = program.emit(undefined, (fn, content) => {
    output = content;
  }, undefined, false, transformers);
  diagnostics.push(...res.diagnostics);
  expect(diagnostics).toEqual([]);
  if (!output) throw new Error('no output');
  return {output, manifest, rootDir};
}

describe('convertCommonJsToGoogModule', () => {
  beforeEach(() => {
    testSupport.addDiffMatchers();
  });

  function expectCommonJs(fileName: string, content: string, isES5 = true) {
    return expect(processES5(fileName, content, {isES5}).output);
  }

  it('adds a goog.module call', () => {
    // NB: no line break added below.
    expectCommonJs('a.ts', `console.log('hello');`).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
console.log('hello');
`);
  });

  it('adds a goog.module call for ES6 mode', () => {
    // NB: no line break added below.
    expectCommonJs('a.ts', `console.log('hello');`, false)
        .toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
console.log('hello');
`);
  });

  it('adds a goog.module call to empty files', () => {
    expectCommonJs('a.ts', ``).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
`);
  });

  it('adds a goog.module call to empty-looking files', () => {
    expectCommonJs('a.ts', `// empty`).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
// empty
`);
  });

  it('strips use strict directives', () => {
    // NB: no line break added below.
    expectCommonJs('a.ts', `"use strict";
console.log('hello');`)
        .toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
console.log('hello');
`);
  });

  it('converts imports to goog.require calls', () => {
    expectCommonJs('a.ts', `import {x} from 'req/mod'; console.log(x);`)
        .toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
var mod_1 = goog.require('req.mod');
console.log(mod_1.x);
`);
  });

  it('converts imports to goog.require calls using const in ES6 mode', () => {
    expectCommonJs(
        'a.ts', `import {x} from 'req/mod'; console.log(x);`,
        /* es5 mode= */ false)
        .toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
const mod_1 = goog.require('req.mod');
console.log(mod_1.x);
`);
  });

  it('converts side-effect import to goog.require calls', () => {
    expectCommonJs('a.ts', `import 'req/mod';`).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
goog.require('req.mod');
`);
  });

  it('converts imports to goog.require calls without assignments after comments',
     () => {
       expectCommonJs('a.ts', `
// Comment
import 'req/mod';`)
           .toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
// Comment
goog.require('req.mod');
`);
     });

  it('keeps fileoverview comments before imports', () => {
    expectCommonJs('a.ts', `/** @modName {mod_a} */

import {dep} from './dep';
import {sharedDep} from './shared_dep';

console.log('in mod_a', dep, sharedDep);
`).toBe(`/** @modName {mod_a} */
goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
var dep_1 = goog.require('dep');
var shared_dep_1 = goog.require('shared_dep');
console.log('in mod_a', dep_1.dep, shared_dep_1.sharedDep);
`);
  });

  it('keeps fileoverview comments not separated by newlines', () => {
    expectCommonJs('a.ts', `/** @modName {mod_a} */
import {dep} from './dep';
import {sharedDep} from './shared_dep';

console.log('in mod_a', dep, sharedDep);
`).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
/** @modName {mod_a} */
var dep_1 = goog.require('dep');
var shared_dep_1 = goog.require('shared_dep');
console.log('in mod_a', dep_1.dep, shared_dep_1.sharedDep);
`);
  });

  it('keeps fileoverview comments before elided imports', () => {
    expectCommonJs('a.ts', `/** @fileoverview Hello Comment. */

import {TypeFromDep} from './dep';

// Only uses the import as a type.
const x: TypeFromDep = 1;

console.log('in mod_a', x);
`).toBe(`/** @fileoverview Hello Comment. */
goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
// Only uses the import as a type.
var x = 1;
console.log('in mod_a', x);
`);
  });

  describe(
      'ES5 export *', () => {
        it('converts export * statements', () => {
          expectCommonJs('a.ts', `export * from 'req/mod';`, true)
              .toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
var tslib_1 = goog.require('tslib');
var tsickle_module_1_ = goog.require('req.mod');
tslib_1.__exportStar(tsickle_module_1_, exports);
`);
        });
        it('uses correct module name with subsequent exports', () => {
          expectCommonJs('a.ts', `export * from 'req/mod';
import {x} from 'req/mod';
console.log(x);
`).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
var tslib_1 = goog.require('tslib');
var tsickle_module_1_ = goog.require('req.mod');
tslib_1.__exportStar(tsickle_module_1_, exports);
var mod_1 = tsickle_module_1_;
console.log(mod_1.x);
`);
        });
        it('reuses an existing imported variable name',
           () => {
             expectCommonJs('a.ts', `import {x} from 'req/mod';
export * from 'req/mod';
console.log(x);`).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
var tslib_1 = goog.require('tslib');
var mod_1 = goog.require('req.mod');
var tsickle_module_1_ = mod_1;
tslib_1.__exportStar(tsickle_module_1_, exports);
console.log(mod_1.x);
`);
           });
      });


  it('resolves relative module URIs', () => {
    // See below for more fine-grained unit tests.
    expectCommonJs('a/b.ts', `import {x} from './req/mod';
console.log(x);`)
        .toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
var mod_1 = goog.require('a.req.mod');
console.log(mod_1.x);
`);
  });

  it('avoids mangling module names in goog: imports', () => {
    expectCommonJs('a/b.ts', `
import Foo from 'goog:foo_bar.baz';
console.log(Foo);`)
        .toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
var goog_foo_bar_baz_1 = goog.require('foo_bar.baz');
console.log(goog_foo_bar_baz_1);
`);
  });

  it('resolves default goog: module imports', () => {
    expectCommonJs('a/b.ts', `
import Foo from 'goog:use.Foo';
console.log(Foo);`)
        .toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
var goog_use_Foo_1 = goog.require('use.Foo');
console.log(goog_use_Foo_1);
`);
  });

  it('resolves renamed default goog: module imports', () => {
    expectCommonJs('a/b.ts', `
import {default as Foo} from 'goog:use.Foo';
console.log(Foo);`)
        .toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
var goog_use_Foo_1 = goog.require('use.Foo');
console.log(goog_use_Foo_1);
`);
  });

  it('resolves exported default goog: module imports', () => {
    expectCommonJs('a/b.ts', `
export {default as Foo} from 'goog:use.Foo';
`).toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
var goog_use_Foo_1 = goog.require('use.Foo');
exports.Foo = goog_use_Foo_1;
`);
  });

  it('rewrites access to .default properties on goog: module namespace imports',
     () => {
       expectCommonJs('a/b.ts', `
import * as Foo from 'goog:use.Foo';
console.log(Foo.default);
`).toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
var Foo = goog.require('use.Foo');
console.log(Foo);
`);
     });

  it('leaves single .default accesses alone', () => {
    // This is a repro for a bug when no goog: symbols are found.
    expectCommonJs('a/b.ts', `
console.log(this.default);
console.log(foo.bar.default);`)
        .toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
console.log(this.default);
console.log(foo.bar.default);
`);
  });

  it('strips "use strict" (implied by goog.module)', () => {
    expectCommonJs('a/b.ts', `/**
 * docstring here
 */
"use strict";
var foo = bar;
`).toBe(`/**
 * docstring here
 */
goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
var foo = bar;
`);
  });

  it('deduplicates module imports', () => {
    expectCommonJs('a/b.ts', `import Foo from 'goog:foo';
import Foo2 from 'goog:foo';
Foo;
Foo2;
`).toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
var goog_foo_1 = goog.require('foo');
var goog_foo_2 = goog_foo_1;
goog_foo_1;
goog_foo_2;
`);
  });

  it('gathers referenced modules', () => {
    const {output, manifest, rootDir} = processES5('a/b.ts', `
import '../foo/bare_require';
import sym from 'goog:foo.bar';
import {es6RelativeRequire} from './relative';
import {es6NonRelativeRequire} from 'non/relative';
console.log(sym, es6RelativeRequire, es6NonRelativeRequire);
`);

    // Sanity check the output.
    expect(output).toBe(`goog.module('a.b');
var module = module || { id: 'a/b.ts' };
goog.require('tslib');
goog.require('foo.bare_require');
var goog_foo_bar_1 = goog.require('foo.bar');
var relative_1 = goog.require('a.relative');
var relative_2 = goog.require('non.relative');
console.log(goog_foo_bar_1, relative_1.es6RelativeRequire, relative_2.es6NonRelativeRequire);
`);

    expect(manifest.getReferencedModules(path.join(rootDir, 'a/b.ts')))
        .toEqual([
          'foo.bare_require',
          'foo.bar',
          'a.relative',
          'non.relative',
        ]);
  });

  it(`skips the exports assignment if there's another one`, () => {
    expectCommonJs(
        'a.ts', `export {}; console.log('hello'); exports = 1;`, false)
        .toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
console.log('hello');
exports = 1;
`);
  });


  it('rewrites live export bindings', () => {
    const before = `
      Object.defineProperty(exports, 'foo', {
        enumerable: true, get: function() { return ns.bar; }
      });
    `;

    expectCommonJs('a.ts', before, false).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
exports.foo = ns.bar;
`);
  });

  it('elides default export values', () => {
    const before = `
      exports.foo = exports.bar = exports.baz = void 0;
      exports.boff = void 0;
      exports.foo = 1;
      exports.bar = 2;
      exports.baz = 3;
      exports.boff = 4;
    `;

    expectCommonJs('a.ts', before, false).toBe(`goog.module('a');
var module = module || { id: 'a.ts' };
goog.require('tslib');
exports.foo = 1;
exports.bar = 2;
exports.baz = 3;
exports.boff = 4;
`);
  });

  describe('dynamic import', () => {
    it('handles dynamic imports', () => {
      const before = `
        (async () => {
          const starImport = await import('./relpath');
        })();
        export {};
      `;
      const beforeLines = (processES5('project/file.ts', before, {
                             isES5: false,
                           }).output as string)
                              .split(/\n/g);

      expect(beforeLines).toEqual(`goog.module('project.file');
var module = module || { id: 'project/file.ts' };
const tslib_1 = goog.require('tslib');
(() => tslib_1.__awaiter(this, void 0, void 0, function* () {
    const starImport = yield goog.requireDynamic('project.relpath');
}))();
`.split(/\n/g));
    });

    it('handles dynamic imports for ES5', () => {
      const before = `
        (async () => {
          const starImport = await import('./relpath');
        })();
        export {};
      `;
      const beforeLines = (processES5('project/file.ts', before, {
                             isES5: true,
                           }).output as string)
                              .split(/\n/g);

      expect(beforeLines).toEqual(`goog.module('project.file');
var module = module || { id: 'project/file.ts' };
var _this = this;
var tslib_1 = goog.require('tslib');
(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
    var starImport;
    return tslib_1.__generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, goog.requireDynamic('project.relpath')];
            case 1:
                starImport = _a.sent();
                return [2 /*return*/];
        }
    });
}); })();
`.split(/\n/g));
    });

    it('handles dynamic imports with destructuring LHS', () => {
      const before = `
        (async () => {
          const {Foo} = await import('./relpath');
        })();
        export {};
      `;
      const beforeLines = (processES5('project/file.ts', before, {
                             isES5: false,
                           }).output as string)
                              .split(/\n/g);

      expect(beforeLines).toEqual(`goog.module('project.file');
var module = module || { id: 'project/file.ts' };
const tslib_1 = goog.require('tslib');
(() => tslib_1.__awaiter(this, void 0, void 0, function* () {
    const { Foo } = yield goog.requireDynamic('project.relpath');
}))();
`.split(/\n/g));
    });

    it('handles dynamic imports for ES5 with destructuring LHS', () => {
      const before = `
        (async () => {
          const {Foo}  = await import('./relpath');
        })();
        export {};
      `;
      const beforeLines = (processES5('project/file.ts', before, {
                             isES5: true,
                           }).output as string)
                              .split(/\n/g);

      expect(beforeLines).toEqual(`goog.module('project.file');
var module = module || { id: 'project/file.ts' };
var _this = this;
var tslib_1 = goog.require('tslib');
(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
    var Foo;
    return tslib_1.__generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, goog.requireDynamic('project.relpath')];
            case 1:
                Foo = (_a.sent()).Foo;
                return [2 /*return*/];
        }
    });
}); })();
`.split(/\n/g));
    });
  });
});

describe('resolveIndexShorthand', () => {
  let resolutionHost: ts.ModuleResolutionHost;
  const opts: ts.CompilerOptions = {
    ...testSupport.compilerOptions,
    baseUrl: '/root',
    outDir: '/root/bin',
    rootDir: '/root',
    rootDirs: ['/root', '/root/gen'],
    paths: {
      '*': ['*', 'gen/*', 'bin/*'],
      'prefix/*': ['changed_prefix/*', 'gen/changed_prefix/*'],
      'angular': ['typings/angular/index'],
    },
  };
  beforeEach(() => {
    resolutionHost = {
      fileExists(fileName: string): boolean {
        switch (fileName) {
          case '/root/my/input.ts':
          case '/root/gen/file.ts':
          case '/root/changed_prefix/prefixed.ts':
          case '/root/gen/changed_prefix/gen.ts':
          case '/root/typings/angular/index.d.ts':
            return true;
          default:
            return false;
        }
      },
      readFile(fileName: string) {
        return 'export const x = 1;';
      },
      getCurrentDirectory() {
        return '/root';
      },
    };
  });

  function expectResolve(context: string, target: string) {
    const resolved = googmodule.resolveModuleName(
        {options: opts, moduleResolutionHost: resolutionHost}, context, target);
    return expect(resolved);
  }

  it('resolves generated files', () => {
    expectResolve('/root/my/input.ts', 'file').toBe('/root/gen/file.ts');
    expectResolve('my/input.ts', 'file').toBe('/root/gen/file.ts');
  });

  it('resolves into prefix mapped', () => {
    expectResolve('my/input.ts', 'prefix/prefixed')
        .toBe('/root/changed_prefix/prefixed.ts');
    expectResolve('/root/my/input.ts', 'prefix/prefixed')
        .toBe('/root/changed_prefix/prefixed.ts');
    expectResolve('/root/my/input.ts', 'prefix/gen')
        .toBe('/root/gen/changed_prefix/gen.ts');
    expectResolve('/root/gen/file.ts', 'prefix/prefixed')
        .toBe('/root/changed_prefix/prefixed.ts');
  });

  it('resolves path mapped modules', () => {
    expectResolve('my/input.ts', 'angular')
        .toBe('/root/typings/angular/index.d.ts');
    expectResolve('/root/my/input.ts', 'angular')
        .toBe('/root/typings/angular/index.d.ts');
    expectResolve('/root/gen/file.ts', 'angular')
        .toBe('/root/typings/angular/index.d.ts');
  });
});
