(function () {
  "use strict";

  /* =====================================================================
     Elements
     ===================================================================== */

  var calculator = document.getElementById("calculator");
  var displayBox = document.querySelector(".display");
  var expressionDisplay = document.getElementById("expression-display");
  var currentDisplay = document.getElementById("current-display");
  var angleToggle = document.getElementById("angle-toggle");
  var modeButtons = document.querySelectorAll(".mode-switch__btn");

  /* =====================================================================
     Constants
     ===================================================================== */

  var MAX_DIGITS = 16;

  var PRECEDENCE = { "+": 1, "-": 1, "\u00d7": 2, "\u00f7": 2, "^": 3, "u-": 4 };
  var RIGHT_ASSOC = { "^": true, "u-": true };
  var CONSTANTS = { "\u03c0": Math.PI, "e": Math.E };
  var DIVIDE = "\u00f7";
  var TIMES = "\u00d7";
  var MINUS = "\u2212";
  var SQRT = "\u221a";
  var SQUARE = "\u00b2";
  var INVERSE = "\u207b\u00b9";

  /* =====================================================================
     State
     ===================================================================== */

  var tokens = [];
  var angleMode = "DEG";
  var justEvaluated = false;
  var finalExpression = "";

  /* =====================================================================
     Number formatting
     ===================================================================== */

  function formatNumber(value) {
    if (typeof value !== "number" || !isFinite(value)) return null;
    if (Object.is(value, -0)) value = 0;
    var rounded = Number.parseFloat(value.toPrecision(12));
    var text = String(rounded);
    if (text.indexOf("e") !== -1) {
      text = rounded.toExponential(8).replace(/\.?0+e/, "e");
    }
    return text;
  }

  /* =====================================================================
     Expression evaluation (tokenizer -> shunting-yard -> RPN)
     No eval() is used anywhere.
     ===================================================================== */

  function autoClose(list) {
    var output = [];
    var open = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === "lparen") open++;
      else if (list[i].type === "rparen") open--;
      output.push(list[i]);
    }
    for (var j = 0; j < open; j++) {
      output.push({ type: "rparen" });
    }
    return output;
  }

  function toRPN(list) {
    var output = [];
    var stack = [];

    for (var i = 0; i < list.length; i++) {
      var token = list[i];

      if (token.type === "number" || token.type === "constant" || token.type === "postfix") {
        output.push(token);
      } else if (token.type === "function") {
        stack.push(token);
      } else if (token.type === "lparen") {
        stack.push(token);
      } else if (token.type === "rparen") {
        while (stack.length && stack[stack.length - 1].type !== "lparen") {
          output.push(stack.pop());
        }
        if (stack.length && stack[stack.length - 1].type === "lparen") stack.pop();
        if (stack.length && stack[stack.length - 1].type === "function") {
          output.push(stack.pop());
        }
      } else if (token.type === "operator") {
        while (stack.length) {
          var top = stack[stack.length - 1];
          if (top.type === "function") {
            output.push(stack.pop());
            continue;
          }
          if (top.type !== "operator") break;
          var p1 = PRECEDENCE[token.value];
          var p2 = PRECEDENCE[top.value];
          if (p2 > p1 || (p2 === p1 && !RIGHT_ASSOC[token.value])) {
            output.push(stack.pop());
          } else {
            break;
          }
        }
        stack.push(token);
      }
    }

    while (stack.length) output.push(stack.pop());
    return output;
  }

  function factorial(n) {
    if (n < 0 || Math.floor(n) !== n) return null;
    if (n > 170) return Infinity;
    var result = 1;
    for (var i = 2; i <= n; i++) result *= i;
    return result;
  }

  function applyPostfix(op, a) {
    if (op === SQUARE) return a * a;
    if (op === "!") return factorial(a);
    if (op === "%") return a / 100;
    if (op === INVERSE) return a === 0 ? null : 1 / a;
    return null;
  }

  function applyFunction(name, a) {
    if (name === SQRT) return a < 0 ? null : Math.sqrt(a);
    var angle = angleMode === "DEG" ? (a * Math.PI) / 180 : a;
    var result;
    switch (name) {
      case "sin":
        result = Math.sin(angle);
        break;
      case "cos":
        result = Math.cos(angle);
        break;
      case "tan":
        result = Math.tan(angle);
        break;
      case "log":
        return a > 0 ? Math.log10(a) : null;
      case "ln":
        return a > 0 ? Math.log(a) : null;
      default:
        return null;
    }
    return Math.abs(result) < 1e-12 ? 0 : result;
  }

  function applyOperator(op, a, b) {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case TIMES:
        return a * b;
      case DIVIDE:
        return a / b;
      case "^":
        return Math.pow(a, b);
      default:
        return null;
    }
  }

  function evalRPN(rpn) {
    var stack = [];

    for (var i = 0; i < rpn.length; i++) {
      var token = rpn[i];
      var a;
      var b;
      var result;

      if (token.type === "number") {
        stack.push(Number(token.value));
      } else if (token.type === "constant") {
        stack.push(CONSTANTS[token.value]);
      } else if (token.type === "postfix") {
        if (!stack.length) return { incomplete: true };
        result = applyPostfix(token.value, stack.pop());
        if (result === null || Number.isNaN(result)) return { error: "Invalid input" };
        stack.push(result);
      } else if (token.type === "function") {
        if (!stack.length) return { incomplete: true };
        result = applyFunction(token.value, stack.pop());
        if (result === null || Number.isNaN(result)) return { error: "Invalid input" };
        stack.push(result);
      } else if (token.type === "operator") {
        if (token.value === "u-") {
          if (!stack.length) return { incomplete: true };
          stack.push(-stack.pop());
          continue;
        }
        if (stack.length < 2) return { incomplete: true };
        b = stack.pop();
        a = stack.pop();
        if (token.value === DIVIDE && b === 0) return { error: "Cannot divide by zero" };
        result = applyOperator(token.value, a, b);
        if (result === null || Number.isNaN(result)) return { error: "Invalid input" };
        stack.push(result);
      }
    }

    if (stack.length !== 1) return { incomplete: true };
    if (!isFinite(stack[0])) return { error: "Result is undefined" };
    return { value: stack[0] };
  }

  function autoCloseTokens(list) {
    var depth = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === "lparen") depth++;
      else if (list[i].type === "rparen") depth--;
    }
    if (depth <= 0) return list.slice();
    var copy = list.slice();
    for (var j = 0; j < depth; j++) copy.push({ type: "rparen" });
    return copy;
  }

  function evaluateTokens(list) {
    if (!list.length) return { incomplete: true };
    return evalRPN(toRPN(autoCloseTokens(list)));
  }

  function previewValue(list) {
    var work = list.slice();
    while (work.length) {
      var result = evaluateTokens(work);
      if (!result.error && !result.incomplete) return result;
      work = work.slice(0, -1);
    }
    return null;
  }

  /* =====================================================================
     Text rendering
     ===================================================================== */

  function tokensText(list) {
    var text = "";
    for (var i = 0; i < list.length; i++) {
      var token = list[i];
      if (token.type === "operator") {
        text += token.value === "u-" ? MINUS : " " + token.value + " ";
      } else if (token.type === "lparen") {
        text += "(";
      } else if (token.type === "rparen") {
        text += ")";
      } else {
        text += token.value;
      }
    }
    return text.trim();
  }

  function lastNumberText() {
    for (var i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].type === "number") return tokens[i].value;
      if (tokens[i].type === "constant") return tokens[i].value;
    }
    return "0";
  }

  function shrinkDisplay() {
    var length = currentDisplay.textContent.length;
    currentDisplay.style.fontSize = length > 12 ? "clamp(1.5rem, 7vw, 2rem)" : "";
  }

  function render() {
    expressionDisplay.textContent = justEvaluated ? finalExpression : tokensText(tokens);
    expressionDisplay.scrollLeft = expressionDisplay.scrollWidth;

    if (!tokens.length) {
      displayBox.classList.remove("is-error");
      currentDisplay.textContent = "0";
      currentDisplay.scrollLeft = 0;
      return;
    }

    var result = evaluateTokens(tokens);

    if (result.error) {
      displayBox.classList.add("is-error");
      currentDisplay.textContent = result.error;
    } else if (!result.incomplete) {
      displayBox.classList.remove("is-error");
      currentDisplay.textContent = formatNumber(result.value);
    } else {
      displayBox.classList.remove("is-error");
      var preview = previewValue(tokens);
      currentDisplay.textContent = preview ? formatNumber(preview.value) : lastNumberText();
    }

    currentDisplay.scrollLeft = currentDisplay.scrollWidth;
    shrinkDisplay();
  }

  /* =====================================================================
     Token helpers
     ===================================================================== */

  function lastToken() {
    return tokens.length ? tokens[tokens.length - 1] : null;
  }

  function isValueToken(token) {
    return (
      token &&
      (token.type === "number" ||
        token.type === "constant" ||
        token.type === "rparen" ||
        token.type === "postfix")
    );
  }

  function applyImplicitMultiply() {
    var last = tokens[tokens.length - 1];
    if (last && (last.type === "number" || last.type === "constant" || last.type === "rparen" || last.type === "postfix")) {
      tokens.push({ type: "operator", value: TIMES });
    }
  }

  function startFreshIfEvaluated() {
    if (justEvaluated) {
      tokens = [];
      justEvaluated = false;
    }
  }

  function openParenCount() {
    var count = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].type === "lparen") count++;
      else if (tokens[i].type === "rparen") count--;
    }
    return count;
  }

  function digitCount(text) {
    return text.replace(/[-.]/g, "").length;
  }

  /* =====================================================================
     Input actions
     ===================================================================== */

  function addDigit(digit) {
    startFreshIfEvaluated();
    var last = tokens[tokens.length - 1];

    if (last && last.type === "number" && last.editing) {
      if (last.value === "0") last.value = digit;
      else if (digitCount(last.value) < MAX_DIGITS) last.value += digit;
    } else {
      applyImplicitMultiply();
      tokens.push({ type: "number", value: digit, editing: true });
    }

    justEvaluated = false;
    render();
  }

  function addDecimal() {
    startFreshIfEvaluated();
    var last = tokens[tokens.length - 1];

    if (last && last.type === "number" && last.editing) {
      if (last.value.indexOf(".") === -1 && digitCount(last.value) < MAX_DIGITS) last.value += ".";
    } else {
      applyImplicitMultiply();
      tokens.push({ type: "number", value: "0.", editing: true });
    }

    justEvaluated = false;
    render();
  }

  function addOperator(op) {
    justEvaluated = false;
    var last = tokens[tokens.length - 1];

    if (!last || last.type === "lparen") {
      if (op === "-") tokens.push({ type: "operator", value: "u-" });
    } else if (last.type === "operator") {
      if (op === "-" && last.value !== "u-") {
        tokens.push({ type: "operator", value: "u-" });
      } else {
        tokens[tokens.length - 1] = { type: "operator", value: op };
      }
    } else {
      tokens.push({ type: "operator", value: op });
    }

    render();
  }

  function addPostfix(op) {
    var last = tokens[tokens.length - 1];
    if (!last) return;
    if (last.type !== "number" && last.type !== "constant" && last.type !== "rparen" && last.type !== "postfix") {
      return;
    }
    tokens.push({ type: "postfix", value: op });
    justEvaluated = false;
    render();
  }

  function addFunction(name) {
    startFreshIfEvaluated();
    applyImplicitMultiply();
    tokens.push({ type: "function", value: name });
    tokens.push({ type: "lparen" });
    justEvaluated = false;
    render();
  }

  function addConstant(name) {
    startFreshIfEvaluated();
    applyImplicitMultiply();
    tokens.push({ type: "constant", value: name });
    justEvaluated = false;
    render();
  }

  function addLeftParen() {
    startFreshIfEvaluated();
    applyImplicitMultiply();
    tokens.push({ type: "lparen" });
    justEvaluated = false;
    render();
  }

  function addRightParen() {
    if (openParenCount() <= 0) return;
    var last = tokens[tokens.length - 1];
    if (!last || last.type === "operator" || last.type === "lparen") return;
    tokens.push({ type: "rparen" });
    justEvaluated = false;
    render();
  }

  function equals() {
    var result = evaluateTokens(tokens);
    if (result.error || result.incomplete) {
      render();
      return;
    }
    finalExpression = tokensText(tokens) + " =";
    tokens = [{ type: "number", value: formatNumber(result.value), editing: true }];
    justEvaluated = true;
    render();
  }

  function deleteLast() {
    if (justEvaluated) justEvaluated = false;

    var last = tokens[tokens.length - 1];
    if (!last) {
      render();
      return;
    }

    if (last.type === "number" && last.editing && last.value.length > 1) {
      last.value = last.value.slice(0, -1);
    } else {
      tokens.pop();
    }

    render();
  }

  function clearAll() {
    tokens = [];
    justEvaluated = false;
    finalExpression = "";
    render();
  }

  /* =====================================================================
     Mode + angle controls
     ===================================================================== */

  function setMode(mode) {
    var scientific = mode === "scientific";
    calculator.classList.toggle("mode-scientific", scientific);
    for (var i = 0; i < modeButtons.length; i++) {
      var isActive = modeButtons[i].dataset.mode === mode;
      modeButtons[i].classList.toggle("is-active", isActive);
      modeButtons[i].setAttribute("aria-selected", isActive ? "true" : "false");
    }
  }

  angleToggle.addEventListener("click", function () {
    angleMode = angleMode === "DEG" ? "RAD" : "DEG";
    angleToggle.textContent = angleMode;
    render();
  });

  for (var m = 0; m < modeButtons.length; m++) {
    modeButtons[m].addEventListener("click", function () {
      setMode(this.dataset.mode);
    });
  }

  /* =====================================================================
     Click handling (single delegated listener)
     ===================================================================== */

  calculator.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    if (button.classList.contains("mode-switch__btn")) return;

    var data = button.dataset;

    if (data.number !== undefined) addDigit(data.number);
    else if (data.operator) addOperator(data.operator);
    else if (data.function) addFunction(data.function);
    else if (data.constant) addConstant(data.constant);
    else if (data.postfix) addPostfix(data.postfix);
    else if (data.action === "decimal") addDecimal();
    else if (data.action === "equals") equals();
    else if (data.action === "delete") deleteLast();
    else if (data.action === "clear") clearAll();
    else if (data.action === "lparen") addLeftParen();
    else if (data.action === "rparen") addRightParen();
  });

  /* =====================================================================
     Keyboard support
     ===================================================================== */

  function flashButton(selector) {
    var button = document.querySelector(selector);
    if (!button || button.offsetParent === null) return;
    button.classList.add("is-pressed");
    setTimeout(function () {
      button.classList.remove("is-pressed");
    }, 120);
  }

  document.addEventListener("keydown", function (event) {
    var key = event.key;

    if (key >= "0" && key <= "9") {
      addDigit(key);
      flashButton('[data-number="' + key + '"]');
      event.preventDefault();
      return;
    }

    switch (key) {
      case "+":
        addOperator("+");
        flashButton('[data-operator="+"]');
        break;
      case "-":
        addOperator("-");
        flashButton('[data-operator="-"]');
        break;
      case "*":
      case "x":
      case "X":
        addOperator(TIMES);
        flashButton('[data-operator="' + TIMES + '"]');
        break;
      case "/":
        addOperator(DIVIDE);
        flashButton('[data-operator="' + DIVIDE + '"]');
        break;
      case "^":
        addOperator("^");
        flashButton('[data-operator="^"]');
        break;
      case "(":
        addLeftParen();
        flashButton('[data-action="lparen"]');
        break;
      case ")":
        addRightParen();
        flashButton('[data-action="rparen"]');
        break;
      case ".":
      case ",":
        addDecimal();
        flashButton('[data-action="decimal"]');
        break;
      case "Enter":
      case "=":
        equals();
        flashButton('[data-action="equals"]');
        break;
      case "Backspace":
        deleteLast();
        flashButton('[data-action="delete"]');
        break;
      case "Escape":
      case "Delete":
        clearAll();
        flashButton('[data-action="clear"]');
        break;
      default:
        return;
    }

    event.preventDefault();
  });

  /* =====================================================================
     Init
     ===================================================================== */

  render();
})();
