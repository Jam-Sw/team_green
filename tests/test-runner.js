/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Test Runner — tests/test-runner.js
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Lightweight, zero-dependency test framework for browser-based testing.
 * Supports suites, tests, beforeEach, assertions, and HTML report output.
 *
 * Usage:
 *   TestRunner.suite('My Suite', function() {
 *     TestRunner.test('my test', function(assert) {
 *       assert.approxEqual(1 + 1, 2, 0.001, '1+1 should be 2');
 *     });
 *   });
 *   TestRunner.run(); // execute all registered tests
 * ═══════════════════════════════════════════════════════════════════════════════
 */

window.TestRunner = (function () {
  'use strict';

  var suites = [];
  var currentSuite = null;
  var results = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: [],
    suiteResults: [],
  };

  /**
   * Define a test suite.
   */
  function suite(name, fn) {
    currentSuite = {
      name: name,
      tests: [],
      beforeEachFn: null,
    };
    suites.push(currentSuite);
    fn();
    currentSuite = null;
  }

  /**
   * Define a test within the current suite.
   */
  function test(name, fn) {
    if (!currentSuite) {
      throw new Error('test() must be called inside a suite()');
    }
    currentSuite.tests.push({ name: name, fn: fn });
  }

  /**
   * Define a beforeEach hook for the current suite.
   */
  function beforeEach(fn) {
    if (!currentSuite) {
      throw new Error('beforeEach() must be called inside a suite()');
    }
    currentSuite.beforeEachFn = fn;
  }

  /**
   * Assertion helpers passed to each test function.
   */
  function createAssert(testName, suiteName) {
    var assertions = [];

    return {
      assertions: assertions,

      /**
       * Check approximate equality within tolerance.
       */
      approxEqual: function (actual, expected, tolerance, msg) {
        var diff = Math.abs(actual - expected);
        var pass = diff <= tolerance;
        assertions.push({
          pass: pass,
          message: msg || ('Expected ' + expected + ' ± ' + tolerance + ', got ' + actual),
          actual: actual,
          expected: expected,
          tolerance: tolerance,
        });
        if (!pass) {
          console.error(
            '  ✗ ' + suiteName + ' > ' + testName + ': ' + msg +
            '\n    Expected: ' + expected + ' ± ' + tolerance +
            '\n    Actual:   ' + actual +
            '\n    Diff:     ' + diff.toFixed(6)
          );
        }
      },

      /**
       * Check that a value is true.
       */
      isTrue: function (value, msg) {
        var pass = value === true;
        assertions.push({
          pass: pass,
          message: msg || ('Expected true, got ' + value),
          actual: value,
        });
        if (!pass) {
          console.error(
            '  ✗ ' + suiteName + ' > ' + testName + ': ' + msg +
            '\n    Got: ' + value
          );
        }
      },

      /**
       * Check that a value is false.
       */
      isFalse: function (value, msg) {
        var pass = value === false;
        assertions.push({
          pass: pass,
          message: msg || ('Expected false, got ' + value),
          actual: value,
        });
        if (!pass) {
          console.error('  ✗ ' + suiteName + ' > ' + testName + ': ' + msg);
        }
      },

      /**
       * Check strict equality.
       */
      equal: function (actual, expected, msg) {
        var pass = actual === expected;
        assertions.push({
          pass: pass,
          message: msg || ('Expected ' + expected + ', got ' + actual),
          actual: actual,
          expected: expected,
        });
        if (!pass) {
          console.error(
            '  ✗ ' + suiteName + ' > ' + testName + ': ' + msg +
            '\n    Expected: ' + JSON.stringify(expected) +
            '\n    Actual:   ' + JSON.stringify(actual)
          );
        }
      },

      /**
       * Check that a function throws an error.
       */
      throws: function (fn, msg) {
        var threw = false;
        try {
          fn();
        } catch (e) {
          threw = true;
        }
        assertions.push({
          pass: threw,
          message: msg || 'Expected function to throw',
        });
        if (!threw) {
          console.error('  ✗ ' + suiteName + ' > ' + testName + ': ' + msg + ' (did not throw)');
        }
      },

      /**
       * Check that a value is not null/undefined.
       */
      exists: function (value, msg) {
        var pass = value !== null && value !== undefined;
        assertions.push({
          pass: pass,
          message: msg || ('Expected value to exist, got ' + value),
          actual: value,
        });
        if (!pass) {
          console.error('  ✗ ' + suiteName + ' > ' + testName + ': ' + msg);
        }
      },

      /**
       * Check that a value is of expected type.
       */
      typeOf: function (value, expectedType, msg) {
        var actualType = typeof value;
        var pass = actualType === expectedType;
        assertions.push({
          pass: pass,
          message: msg || ('Expected type ' + expectedType + ', got ' + actualType),
        });
        if (!pass) {
          console.error('  ✗ ' + suiteName + ' > ' + testName + ': ' + msg);
        }
      },
    };
  }

  /**
   * Run all registered test suites and return results.
   */
  function run() {
    results = { total: 0, passed: 0, failed: 0, errors: [], suiteResults: [] };

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SunPage Test Suite');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    suites.forEach(function (s) {
      console.log('┌── ' + s.name);
      var suiteResult = { name: s.name, tests: [], passed: 0, failed: 0 };

      s.tests.forEach(function (t) {
        results.total++;
        var assert = createAssert(t.name, s.name);
        var error = null;

        try {
          // Run beforeEach if defined
          if (s.beforeEachFn) {
            s.beforeEachFn();
          }
          t.fn(assert);
        } catch (e) {
          error = e;
        }

        var allPassed = !error && assert.assertions.every(function (a) { return a.pass; });

        if (allPassed && assert.assertions.length > 0) {
          results.passed++;
          suiteResult.passed++;
          console.log('│  ✓ ' + t.name);
        } else if (error) {
          results.failed++;
          suiteResult.failed++;
          var errMsg = error.message || String(error);
          results.errors.push({
            suite: s.name,
            test: t.name,
            error: errMsg,
            stack: error.stack,
          });
          console.error('│  ✗ ' + t.name + ' — ERROR: ' + errMsg);
        } else if (assert.assertions.length === 0) {
          // No assertions = skip
          console.log('│  ○ ' + t.name + ' (no assertions)');
        } else {
          results.failed++;
          suiteResult.failed++;
          var failedAssertions = assert.assertions.filter(function (a) { return !a.pass; });
          results.errors.push({
            suite: s.name,
            test: t.name,
            failedAssertions: failedAssertions,
          });
          console.error('│  ✗ ' + t.name + ' (' + failedAssertions.length + ' assertion(s) failed)');
        }

        suiteResult.tests.push({
          name: t.name,
          passed: allPassed,
          assertions: assert.assertions,
          error: error ? error.message : null,
        });
      });

      console.log('└── ' + suiteResult.passed + '/' + s.tests.length + ' passed');
      console.log('');
      results.suiteResults.push(suiteResult);
    });

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    var statusEmoji = results.failed === 0 ? '✅' : '❌';
    console.log('  ' + statusEmoji + ' Results: ' + results.passed + '/' + results.total +
      ' passed, ' + results.failed + ' failed');
    console.log('═══════════════════════════════════════════════════════════════');

    if (results.failed > 0) {
      console.log('');
      console.log('FAILURES:');
      results.errors.forEach(function (err, i) {
        console.log('  ' + (i + 1) + '. ' + err.suite + ' > ' + err.test);
        if (err.error) {
          console.log('     Error: ' + err.error);
        }
        if (err.failedAssertions) {
          err.failedAssertions.forEach(function (a) {
            console.log('     • ' + a.message);
          });
        }
      });
    }

    // Render HTML report if DOM is available
    renderHTMLReport(results);

    return results;
  }

  /**
   * Render a visual HTML report.
   */
  function renderHTMLReport(results) {
    var container = document.getElementById('testResults');
    if (!container) return;

    var html = '';

    // Summary bar
    var pct = results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0;
    var barColor = results.failed === 0 ? '#22c55e' : (results.failed < results.total / 2 ? '#eab308' : '#ef4444');
    html += '<div class="test-summary" style="background:' + barColor + '20;border-left:4px solid ' + barColor + ';padding:16px;margin:16px 0;border-radius:8px">';
    html += '<h2 style="margin:0 0 8px">' + (results.failed === 0 ? '✅ All Tests Passed' : '❌ ' + results.failed + ' Test(s) Failed') + '</h2>';
    html += '<div style="display:flex;gap:24px;font-size:14px">';
    html += '<span><strong>' + results.total + '</strong> total</span>';
    html += '<span style="color:#22c55e"><strong>' + results.passed + '</strong> passed</span>';
    html += '<span style="color:#ef4444"><strong>' + results.failed + '</strong> failed</span>';
    html += '<span><strong>' + pct + '%</strong> pass rate</span>';
    html += '</div>';
    html += '<div style="margin-top:8px;height:6px;background:#333;border-radius:3px;overflow:hidden">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px;transition:width 0.5s"></div>';
    html += '</div>';
    html += '</div>';

    // Suite details
    results.suiteResults.forEach(function (suite) {
      var suitePass = suite.failed === 0;
      html += '<div class="test-suite" style="margin:12px 0;border:1px solid #333;border-radius:8px;overflow:hidden">';
      html += '<div style="padding:12px 16px;background:' + (suitePass ? '#22c55e15' : '#ef444415') + ';border-bottom:1px solid #333;font-weight:600;font-size:14px">';
      html += (suitePass ? '✅' : '❌') + ' ' + suite.name;
      html += ' <span style="float:right;font-weight:400;color:#888">' + suite.passed + '/' + suite.tests.length + '</span>';
      html += '</div>';

      suite.tests.forEach(function (t) {
        var icon = t.passed ? '✓' : '✗';
        var color = t.passed ? '#22c55e' : '#ef4444';
        html += '<div style="padding:6px 16px 6px 32px;font-size:13px;border-bottom:1px solid #222;color:' + color + '">';
        html += icon + ' ' + t.name;
        if (!t.passed && t.error) {
          html += '<div style="color:#ef4444;font-size:12px;margin-top:4px;padding:4px 8px;background:#ef444410;border-radius:4px">' + t.error + '</div>';
        }
        if (!t.passed && t.assertions) {
          t.assertions.filter(function (a) { return !a.pass; }).forEach(function (a) {
            html += '<div style="color:#f97316;font-size:12px;margin-top:2px;padding:2px 8px">• ' + a.message + '</div>';
          });
        }
        html += '</div>';
      });

      html += '</div>';
    });

    container.innerHTML = html;
  }

  /**
   * Reset all registered suites (useful for re-running).
   */
  function reset() {
    suites = [];
    currentSuite = null;
    results = { total: 0, passed: 0, failed: 0, errors: [], suiteResults: [] };
  }

  return {
    suite: suite,
    test: test,
    beforeEach: beforeEach,
    run: run,
    reset: reset,
    getResults: function () { return results; },
  };
})();
