"use strict";
(() => {
  // src/parser.ts
  var number = "([0-9]+(?:\\.[0-9]+)?)\\s*(?:px|\u50CF\u7D20)?";
  function value(text, tokens) {
    if (!tokens.some((t) => text.includes(t))) return;
    const starts = tokens.map((token) => ({ index: text.indexOf(token), length: token.length })).filter((x) => x.index >= 0).sort((a, b) => a.index - b.index);
    if (!starts.length) return;
    const clause = text.slice(starts[0].index + starts[0].length).split(/[,，。；;]/)[0];
    const assigned = [...clause.matchAll(new RegExp("(?:\u6539\u6210|\u6539\u4E3A|\u8BBE\u4E3A|\u8BBE\u7F6E\u4E3A|\u53D8\u6210|\u53D8\u4E3A|\u8C03\u5230|\u6539\u5230|\u8C03\u6574\u4E3A|\u8C03\u6574\u5230|\u66F4\u65B0\u4E3A|\\bto\\b)\\s*" + number, "gi"))];
    if (assigned.length) return Number(assigned[assigned.length - 1][1]);
    const fromTo = clause.match(new RegExp("(?:\u4ECE|\u7531|from)\\s*" + number + "\\s*(?:\u5230|\u81F3|to)\\s*" + number, "i"));
    if (fromTo) return Number(fromTo[2]);
    const matches = [...clause.matchAll(new RegExp(number, "g"))];
    if (matches.length === 1) return Number(matches[0][1]);
    return void 0;
  }
  function parse(raw) {
    const t = raw.trim().replace(/，/g, ",").replace(/：/g, ":");
    if (!t) return { error: "\u8BF7\u8F93\u5165\u6307\u4EE4\u3002" };
    if (/(?:在这里|在此处|这里).*(?:创建|新建|生成).*(?:按钮)|(?:创建|新建|生成).*(?:按钮).*(?:在这里|在此处)/.test(t)) return { intent: { kind: "createButton", .../主要|primary/i.test(t) ? { role: "primary" } : {} } };
    if (/(?:复制|克隆).*(?:三个|3个|3 个).*(?:按钮)?|(?:按钮).*(?:复制|克隆).*(?:三个|3个|3 个)/.test(t)) return { intent: { kind: "duplicateButtons", total: 3 } };
    if (/第[一1]个/.test(t) && /保持|设为|改为|改成/.test(t) && /主要|primary/i.test(t)) return { intent: { kind: "ensurePrimary" } };
    if (/第[二三23]个/.test(t) && /次要|危险|secondary|danger|destructive/i.test(t)) {
      const clauses = t.split(/[,;；。]/).map((s) => s.trim()).filter(Boolean);
      const changes = [];
      for (const clause of clauses) {
        const index = /第[二2]个/.test(clause) ? 2 : /第[三3]个/.test(clause) ? 3 : null;
        const role = /次要|secondary/i.test(clause) ? "secondary" : /危险|danger|destructive/i.test(clause) ? "danger" : null;
        if (index === null || role === null || changes.some((c) => c.index === index)) return { error: "\u8BF7\u5206\u522B\u8BF4\u660E\u7B2C\u4E8C\u4E2A\u548C\u7B2C\u4E09\u4E2A\u6309\u94AE\u7684\u8BED\u4E49\u7C7B\u578B\u3002" };
        changes.push({ index, role });
      }
      if (changes.length !== 2 || !changes.some((c) => c.index === 2 && c.role === "secondary") || !changes.some((c) => c.index === 3 && c.role === "danger")) return { error: "\u8BF7\u660E\u786E\u6307\u5B9A\u7B2C\u4E8C\u4E2A\u4E3A\u6B21\u8981\u6309\u94AE\u3001\u7B2C\u4E09\u4E2A\u4E3A\u5371\u9669\u6309\u94AE\u3002" };
      return { intent: { kind: "setButtonTypes", changes } };
    }
    if (/第[二三23]个/.test(t) && /(?:灰|红)/.test(t)) {
      const clauses = t.split(/[,;；。]/).map((s) => s.trim()).filter(Boolean);
      const changes = [];
      for (const clause of clauses) {
        const index = /第[二2]个/.test(clause) ? 2 : /第[三3]个/.test(clause) ? 3 : null;
        const color = /灰/.test(clause) ? "gray" : /红/.test(clause) ? "red" : null;
        if (index === null || color === null || changes.some((c) => c.index === index)) return { error: "\u8BF7\u5206\u522B\u8BF4\u660E\u7B2C\u4E8C\u4E2A\u548C\u7B2C\u4E09\u4E2A\u6309\u94AE\u7684\u989C\u8272\uFF0C\u907F\u514D\u6B67\u4E49\u3002" };
        changes.push({ index, color });
      }
      if (changes.length !== 2 || !changes.some((c) => c.index === 2 && c.color === "gray") || !changes.some((c) => c.index === 3 && c.color === "red")) return { error: "\u8BF7\u660E\u786E\u6307\u5B9A\u7B2C\u4E8C\u4E2A\u4E3A\u7070\u8272\u3001\u7B2C\u4E09\u4E2A\u4E3A\u7EA2\u8272\u3002" };
      return { intent: { kind: "colorButtons", changes } };
    }
    if (/(?:或|或者|还是|\bor\b|\/|~|～)/i.test(t) && [...t.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].length > 1) return { error: "\u5B58\u5728\u591A\u4E2A\u5019\u9009\u6570\u503C\uFF0C\u8BF7\u53EA\u6307\u5B9A\u4E00\u4E2A\u76EE\u6807\u503C\u3002" };
    const rename = t.match(/(?:批量)?(?:重命名|命名为|改名为)\s*[:：]?\s*[「“"']?(.+?)[」”"']?$/);
    if (rename) {
      const pattern = rename[1].trim().replace(/[」”"']$/, "");
      return pattern && pattern.length <= 80 ? { intent: { kind: "rename", pattern } } : { error: "\u8BF7\u8F93\u5165\u4E0D\u8D85\u8FC7 80 \u5B57\u7684\u540D\u79F0\u3002" };
    }
    const named = t.match(/(?:应用|使用|套用)(?:已有|本地)?\s*(?:名为)?[「“"']?(.+?)[」”"']?\s*(文字样式|文本样式|填充样式|颜色样式|样式|变量)$/);
    if (named) return { intent: { kind: named[2] === "\u53D8\u91CF" ? "variable" : "style", name: named[1].trim() } };
    const variant = t.match(/(?:切换|改成|设为|使用)(?:组件)?(?:变体|属性)?\s*[「“"']?(Small|Medium|Large|Secondary|Primary|小号|中号|大号|次要|主要)[」”"']?$/i);
    if (variant) return { intent: { kind: "variant", value: variant[1] } };
    if (/hug|fill|内容自适应|填满|撑满/i.test(t)) {
      const axis = /高|纵|垂直/.test(t) ? "vertical" : "horizontal";
      return { intent: { kind: "sizing", axis, value: /fill|填满|撑满/i.test(t) ? "FILL" : "HUG" } };
    }
    const dimension = [["gap", ["\u95F4\u8DDD", "gap", "spacing"]], ["padding", ["\u5185\u8FB9\u8DDD", "padding"]], ["width", ["\u5BBD\u5EA6", "\u5BBD", "width"]], ["height", ["\u9AD8\u5EA6", "\u9AD8", "height"]]];
    for (const [kind, terms] of dimension) {
      if (terms.some((x) => t.toLowerCase().includes(x))) {
        const n = value(t.toLowerCase(), terms);
        if (n === void 0) return { error: "\u8BF7\u7ED9\u51FA\u660E\u786E\u6570\u503C\uFF0C\u4F8B\u5982\u201C\u95F4\u8DDD\u6539\u6210 8 px\u201D\u3002" };
        if (!Number.isFinite(n) || n < 0 || n > 1e4 || (kind === "width" || kind === "height") && n === 0) return { error: "\u6570\u503C\u987B\u5728 0\u201310000 px \u4E4B\u95F4\u3002" };
        return { intent: { kind, value: n } };
      }
    }
    if (/小一点|缩小一点|smaller/i.test(t)) return { intent: { kind: "smaller" } };
    if (/等距|均匀分布|平均分布/.test(t)) return { intent: { kind: "distribute", value: /纵向|垂直/.test(t) ? "vertical" : "horizontal" } };
    if (/横向|水平排列|改成横排|horizontal/i.test(t)) return { intent: { kind: "direction", value: "HORIZONTAL" } };
    if (/纵向|垂直排列|改成竖排|vertical/i.test(t)) return { intent: { kind: "direction", value: "VERTICAL" } };
    if (/居中|左对齐|右对齐|顶部对齐|底部对齐/.test(t)) return { intent: { kind: "align", axis: /顶部|底部|垂直/.test(t) ? "vertical" : "horizontal", value: /左|顶部/.test(t) ? "MIN" : /右|底部/.test(t) ? "MAX" : "CENTER" } };
    return { error: "\u6682\u4E0D\u652F\u6301\u8FD9\u6761\u6307\u4EE4\u3002\u53EF\u8C03\u6574\u5E03\u5C40\u3001\u5C3A\u5BF8\u3001\u6837\u5F0F\u3001\u53D8\u91CF\u6216\u6279\u91CF\u547D\u540D\u3002" };
  }

  // src/jev.ts
  var targets = /* @__PURE__ */ new Set(["current", "selected", "first", "middle", "last", "all", "previous", "named"]);
  var roles = /* @__PURE__ */ new Set(["primary", "secondary", "danger"]);
  var properties = /* @__PURE__ */ new Set(["size", "width", "height", "cornerRadius", "fill", "stroke", "textColor", "strokeWidth", "layout", "semanticRole", "componentOverride", "content"]);
  var modes = /* @__PURE__ */ new Set(["set", "increase", "decrease", "restore"]);
  var directions = /* @__PURE__ */ new Set(["left", "right", "above", "below"]);
  var length = (value2) => value2?.kind === "length" && value2.unit === "px" && Number.isFinite(value2.amount) && value2.amount >= 0 && value2.amount <= 1e4;
  var textValue = (value2, transcript) => value2?.kind === "text" && typeof value2.text === "string" && value2.text.trim().length > 0 && value2.text.length <= 80 && Number.isInteger(value2.source?.start) && Number.isInteger(value2.source?.end) && value2.source.start >= 0 && value2.source.end > value2.source.start && transcript.slice(value2.source.start, value2.source.end) === value2.text;
  var colorValue = (value2) => value2?.kind === "color" && (value2.source === "literal" && (["red", "blue", "gray", "green", "yellow", "black", "white"].includes(value2.name) || /^#[0-9a-fA-F]{6}$/.test(value2.name)) || value2.source === "semantic" && ["primary", "secondary", "danger"].includes(value2.name));
  function validEdit(command, transcript) {
    const p = command.parameters;
    if (!p || typeof p !== "object" || !["object", "text", "property"].includes(command.operand)) return false;
    if (command.operation === "undo") return command.operand === "object";
    if (command.operation === "add" && command.operand === "object") return ["component", "circle", "rectangle", "text"].includes(p.object) && (p.object !== "component" || p.semantic === "button") && (p.position?.kind === "anchor" || p.position?.kind === "relative" && targets.has(p.position.reference) && directions.has(p.position.direction)) && (p.content === void 0 || p.object === "text" && textValue(p.content, transcript));
    if (!targets.has(command.target)) return false;
    if (p.expectedObject !== void 0 && !["component", "circle", "rectangle", "text"].includes(p.expectedObject)) return false;
    if (p.expectedSemantic !== void 0 && (p.expectedObject !== "component" || p.expectedSemantic !== "button")) return false;
    if (command.operation === "delete") return command.operand !== "property" || properties.has(p.property);
    if (command.operand === "text" && ["add", "set"].includes(command.operation)) return textValue(p.value, transcript) && ["center", "existing-or-center"].includes(p.placement);
    if (command.operand === "property" && ["add", "set", "adjust"].includes(command.operation)) {
      if (!properties.has(p.property)) return false;
      if (command.operation === "add" && p.property === "stroke") return p.value === void 0 || colorValue(p.value);
      if (!modes.has(p.mode)) return false;
      if (p.mode === "restore") return p.value === void 0;
      if (["size", "width", "height", "cornerRadius"].includes(p.property)) return p.value?.kind === "step" && p.value.count === 1 || length(p.value);
      if (p.property === "strokeWidth") return length(p.value);
      if (["fill", "stroke", "textColor"].includes(p.property)) return colorValue(p.value);
      if (p.property === "semanticRole") return p.value?.kind === "role" && roles.has(p.value.name);
      if (p.property === "layout") return p.value?.kind === "layout" && ["horizontal", "vertical"].includes(p.value.direction);
      return false;
    }
    if (command.operation === "duplicate") return command.operand === "object" && Number.isInteger(p.additional) && p.additional >= 1 && p.additional <= 19 && ["horizontal", "vertical"].includes(p.arrangement);
    if (command.operation === "move") return command.operand === "object" && directions.has(p.direction) && length(p.distance);
    if (command.operation === "arrange") return command.operand === "object" && ["horizontal", "vertical"].includes(p.direction);
    return false;
  }
  function valid(command, transcript) {
    if (!command || typeof command !== "object") return false;
    if (command.kind === "edit") return validEdit(command, transcript);
    if (command.kind === "undo") return command.reason === "correction" || command.reason === "explicit";
    if (command.kind === "create") {
      const position = command.position;
      const validPosition = position?.kind === "anchor" || position?.kind === "relative" && targets.has(position.reference) && directions.has(position.direction);
      return ["component", "circle", "rectangle", "text"].includes(command.object) && validPosition && (command.object !== "component" || command.semantic === "button") && (command.role === void 0 || command.semantic === "button" && roles.has(command.role)) && (command.content === void 0 || command.object === "text" && textValue(command.content, transcript));
    }
    if (command.kind === "duplicate") return targets.has(command.target) && Number.isInteger(command.additional) && command.additional >= 1 && command.additional <= 19 && ["horizontal", "vertical"].includes(command.arrangement);
    if (command.kind === "move") return targets.has(command.target) && directions.has(command.direction) && length(command.distance);
    if (command.kind === "arrange") return targets.has(command.target) && ["horizontal", "vertical"].includes(command.direction);
    if (command.kind === "batch") return Array.isArray(command.commands) && command.commands.length >= 2 && command.commands.length <= 3 && command.commands.every((item) => valid(item, transcript) && (item.kind === "modify" || item.kind === "edit" && item.operand === "property" && ["set", "adjust"].includes(item.operation)));
    if (command.kind === "sequence") return Array.isArray(command.commands) && command.commands.length >= 2 && command.commands.length <= 3 && (command.commands[0].kind === "create" || command.commands[0].kind === "edit" && command.commands[0].operation === "add" && ["object", "property"].includes(command.commands[0].operand)) && command.commands.every((item, index) => item.kind !== "sequence" && item.kind !== "batch" && item.kind !== "undo" && valid(item, transcript) && (index === 0 || !["modify", "edit"].includes(item.kind) || "target" in item && item.target === "previous"));
    if (command.kind !== "modify" || !targets.has(command.target) || !properties.has(command.property) || !modes.has(command.mode)) return false;
    if (command.expectedObject !== void 0 && !["component", "circle", "rectangle", "text"].includes(command.expectedObject)) return false;
    if (command.expectedSemantic !== void 0 && (command.expectedObject !== "component" || command.expectedSemantic !== "button")) return false;
    if (command.mode === "restore") return command.value === void 0;
    const value2 = command.value;
    if (command.property === "content") return command.mode === "set" && command.slot === "content" && ["center", "existing-or-center"].includes(command.placement) && textValue(value2, transcript);
    if (["size", "width", "height", "cornerRadius"].includes(command.property)) return value2?.kind === "step" && value2.count === 1 || length(value2);
    if (command.property === "strokeWidth") return length(value2);
    if (["fill", "stroke", "textColor"].includes(command.property)) return colorValue(value2);
    if (command.property === "semanticRole") return value2?.kind === "role" && roles.has(value2.name);
    if (command.property === "layout") return value2?.kind === "layout" && ["horizontal", "vertical"].includes(value2.direction);
    return false;
  }
  async function interpret(text, context2, request) {
    const response = await request(text, context2);
    const payload = response.payload;
    if (!response.ok) throw Error(payload.error || `Jev \u670D\u52A1\u9519\u8BEF\uFF08HTTP ${response.status}\uFF09\u3002`);
    if (payload.source !== "jev" || typeof payload.confidence !== "number" || payload.confidence < 0.8 || !valid(payload.command, text.trim()))
      throw Error("Jev \u8FD4\u56DE\u4E86\u65E0\u6548\u6216\u4F4E\u7F6E\u4FE1\u5EA6\u7684\u7F16\u8F91\u547D\u4EE4\uFF0C\u672C\u6B65\u672A\u6267\u884C\u3002");
    return { command: payload.command, confidence: payload.confidence };
  }

  // src/workflow.ts
  var anchor = null;
  var ids = [];
  var revision = 0;
  var history = [];
  var copy = () => ({ anchor: anchor && { ...anchor }, ids: [...ids] });
  var samePage = () => anchor?.pageId === figma.currentPage.id;
  var nameOf = (n) => n.parent?.type === "COMPONENT_SET" ? n.parent.name + " / " + n.name : n.name;
  var isButton = (n) => /button|按钮|btn/i.test(nameOf(n));
  var node = async (id) => await figma.getNodeByIdAsync(id);
  function isWorkflow(intent) {
    return intent.kind === "createButton" || intent.kind === "duplicateButtons" || intent.kind === "colorButtons" || intent.kind === "ensurePrimary" || intent.kind === "setButtonTypes";
  }
  function anchorLabel() {
    return anchor && samePage() ? `(${Math.round(anchor.x)}, ${Math.round(anchor.y)})` : null;
  }
  function currentAnchor() {
    return anchor && samePage() ? { ...anchor } : null;
  }
  function hasWorkflowUndo() {
    return history.length > 0;
  }
  function recordDrop(e) {
    if (e.dropMetadata?.kind !== "creation-anchor") return false;
    history.push({ before: copy(), mutation: false });
    anchor = { x: e.absoluteX, y: e.absoluteY, pageId: figma.currentPage.id };
    ids = [];
    revision++;
    return true;
  }
  async function buttons() {
    await figma.loadAllPagesAsync();
    return figma.root.findAllWithCriteria({ types: ["COMPONENT"] }).filter(isButton);
  }
  async function groupNodes() {
    if (!ids.length) {
      const selected2 = figma.currentPage.selection;
      if (selected2.length === 1 && (selected2[0].type === "INSTANCE" || selected2[0].type === "FRAME") && selected2[0].parent?.type === "PAGE") return [selected2[0]];
      throw Error("\u8BF7\u5148\u521B\u5EFA\u6309\u94AE\uFF0C\u6216\u660E\u786E\u9009\u4E2D\u5F53\u524D\u9875\u9762\u7684\u4E00\u4E2A\u6309\u94AE\u3002");
    }
    const found = await Promise.all(ids.map(node));
    if (found.some((n) => !n || n.type !== "INSTANCE" && n.type !== "FRAME" || n.parent?.type !== "PAGE" || n.parent.id !== figma.currentPage.id))
      throw Error("\u6309\u94AE\u7EC4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u4ECE\u521B\u5EFA\u6B65\u9AA4\u5F00\u59CB\u3002");
    return found;
  }
  var aliases = { gray: /gray|grey|neutral|secondary|灰|中性|次要/i, red: /red|danger|error|destructive|红|危险|错误/i };
  var roles2 = { primary: /primary|主要|主按钮/i, secondary: /secondary|次要|次级/i, danger: /danger|destructive|危险|破坏/i };
  var roleKey = /type|intent|variant|kind|role|style|类型|用途|语义/i;
  var colorKey = /color|colour|tone|颜色|色彩/i;
  function hasRole(c, role) {
    return Object.entries(c.variantProperties || {}).some(([key, value2]) => roleKey.test(key) && roles2[role].test(value2)) || (!c.variantProperties || !Object.entries(c.variantProperties).some(([key]) => roleKey.test(key))) && roles2[role].test(c.name);
  }
  function semanticVariant(n, role, main) {
    if (!main || main.parent?.type !== "COMPONENT_SET") return null;
    const props = n.variantProperties || {};
    return main.parent.children.find((c) => c.type === "COMPONENT" && hasRole(c, role) && Object.entries(props).every(([key, value2]) => roleKey.test(key) || colorKey.test(key) || c.variantProperties?.[key] === value2)) || null;
  }
  function matchingVariant(n, color, main) {
    if (!main || main.parent?.type !== "COMPONENT_SET") return null;
    const props = n.variantProperties || {};
    const test = aliases[color];
    return main.parent.children.find((c) => c.type === "COMPONENT" && Object.entries(c.variantProperties || {}).some(([key, value2]) => test.test(value2) && /color|colour|tone|intent|style|颜色|色彩|状态/i.test(key)) && Object.entries(props).every(([key, value2]) => /color|colour|tone|intent|style|颜色|色彩|状态/i.test(key) || c.variantProperties?.[key] === value2)) || null;
  }
  async function colorDecision(n, color) {
    if (n.type === "INSTANCE") {
      const match = matchingVariant(n, color, await n.getMainComponentAsync());
      if (match) return { kind: "variant", component: match, source: `\u7EC4\u4EF6\u53D8\u4F53 ${match.name}` };
    }
    if (n.fills === figma.mixed) throw Error(`${n.name} \u7684\u586B\u5145\u4E3A\u6DF7\u5408\u503C\uFF0C\u65E0\u6CD5\u5B89\u5168\u6539\u8272\u3002`);
    const variables = (await figma.variables.getLocalVariablesAsync()).filter((v) => v.resolvedType === "COLOR" && aliases[color].test(v.name));
    if (variables.length === 1) return { kind: "variable", variable: variables[0], source: `\u672C\u5730\u989C\u8272\u53D8\u91CF ${variables[0].name}` };
    return { kind: "suggestion", source: `\u63D2\u4EF6\u5EFA\u8BAE\u8272 ${color === "gray" ? "#808080" : "#D92D20"}` };
  }
  async function previewWorkflow(intent, candidateId) {
    if (intent.kind === "createButton") {
      if (!anchor || !samePage()) throw Error("\u8BF7\u5148\u628A\u201C\u521B\u5EFA\u4F4D\u7F6E\u201D\u62D6\u5230\u5F53\u524D\u9875\u9762\u7684\u7A7A\u753B\u5E03\u3002");
      const found = (await buttons()).filter((c) => {
        if (intent.role === "primary" && !hasRole(c, "primary")) return false;
        if (c.parent?.type !== "COMPONENT_SET") return true;
        const primary = c.parent.defaultVariant;
        if (intent.role !== "primary") return c.id === primary.id;
        const defaults = primary.variantProperties || {};
        return Object.entries(defaults).every(([key, value2]) => roleKey.test(key) || colorKey.test(key) || c.variantProperties?.[key] === value2);
      });
      if (intent.role === "primary" && !found.length) throw Error("\u5F53\u524D\u6587\u4EF6\u6CA1\u6709\u53EF\u786E\u8BA4\u7684\u4E3B\u8981\u6309\u94AE\u7EC4\u4EF6\uFF1B\u4E0D\u4F1A\u731C\u6D4B\u521B\u5EFA\u3002");
      const choices = found.map((c) => ({ id: c.id, label: `${nameOf(c)} \xB7 ${c.width}\xD7${c.height} \xB7 ${JSON.stringify(c.variantProperties || {})}` }));
      if (found.length > 1 && !candidateId) return { intent, rows: [`\u843D\u70B9 ${anchorLabel()}\uFF1B\u627E\u5230 ${found.length} \u4E2A\u6309\u94AE\u7EC4\u4EF6\uFF0C\u8BF7\u5148\u9009\u62E9\u6765\u6E90\u3002`], choices, revision };
      const chosen = found.find((c) => c.id === (candidateId || found[0]?.id));
      if (found.length && !chosen) throw Error("\u6240\u9009\u7EC4\u4EF6\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      return { intent, rows: [chosen ? `\u5728 ${anchorLabel()} \u521B\u5EFA\u7EC4\u4EF6\u5B9E\u4F8B\uFF1B\u6765\u6E90\uFF1A${nameOf(chosen)}\uFF1B\u53D8\u4F53\uFF1A${JSON.stringify(chosen.variantProperties || {})}` : `\u5728 ${anchorLabel()} \u521B\u5EFA\u666E\u901A\u53EF\u7F16\u8F91\u6309\u94AE\uFF1B\u6765\u6E90\uFF1A\u63D2\u4EF6\u5EFA\u8BAE\u503C\uFF08\u84DD\u8272 #0D75E8\u3001\u6309\u94AE\u6587\u5B57\u3001\u5185\u8FB9\u8DDD\uFF09`], candidateId: chosen?.id, revision };
    }
    const group = await groupNodes();
    if (intent.kind === "duplicateButtons") {
      if (group.length !== 1) throw Error("\u5F53\u524D\u4E0D\u662F\u5355\u4E2A\u8D77\u59CB\u6309\u94AE\uFF0C\u4E0D\u80FD\u91CD\u590D\u590D\u5236\u4E3A\u4E09\u4E2A\u3002");
      return { intent, rows: [`\u4EE5 ${group[0].name} \u4E3A\u6765\u6E90\uFF0C\u590D\u5236\u4E24\u4E2A\u5E76\u5728\u5F53\u524D\u9875\u9762\u5E76\u6392\u653E\u7F6E\uFF0C\u5F62\u6210\u4E09\u4E2A\u6309\u94AE\uFF1B\u95F4\u8DDD\u5EFA\u8BAE 12 px\u3002`], revision };
    }
    if (group.length !== 3) throw Error("\u8BF7\u5148\u628A\u6309\u94AE\u590D\u5236\u4E3A\u4E09\u4E2A\u3002");
    if (intent.kind === "ensurePrimary") {
      const first = group[0];
      if (first.type !== "INSTANCE") throw Error("\u7B2C\u4E00\u4E2A\u6309\u94AE\u4E0D\u662F\u7EC4\u4EF6\u5B9E\u4F8B\uFF0C\u65E0\u6CD5\u786E\u8BA4\u4E3B\u8981\u8BED\u4E49\u7C7B\u578B\u3002");
      const main = await first.getMainComponentAsync();
      const target = main && hasRole(main, "primary") ? main : semanticVariant(first, "primary", main);
      if (!target) throw Error("\u6587\u4EF6\u4E2D\u627E\u4E0D\u5230\u4FDD\u6301\u5C3A\u5BF8\u7B49\u5C5E\u6027\u7684\u4E3B\u8981\u6309\u94AE\u53D8\u4F53\u3002");
      return { intent, rows: [`\u7B2C\u4E00\u4E2A ${first.name} \u2192 \u4E3B\u8981\u6309\u94AE\uFF1B\u6765\u6E90\uFF1A\u7EC4\u4EF6\u53D8\u4F53 ${nameOf(target)}`], revision };
    }
    if (intent.kind === "setButtonTypes") {
      const rows2 = [];
      for (const change of intent.changes) {
        const target = group[change.index - 1];
        if (target.type !== "INSTANCE") throw Error(`\u7B2C${change.index}\u4E2A\u6309\u94AE\u4E0D\u662F\u7EC4\u4EF6\u5B9E\u4F8B\uFF0C\u65E0\u6CD5\u8BBE\u7F6E\u8BED\u4E49\u7C7B\u578B\u3002`);
        const component2 = semanticVariant(target, change.role, await target.getMainComponentAsync());
        if (!component2) throw Error(`\u6587\u4EF6\u4E2D\u627E\u4E0D\u5230\u7B2C${change.index}\u4E2A\u6309\u94AE\u5BF9\u5E94\u7684${change.role === "secondary" ? "\u6B21\u8981" : "\u5371\u9669"}\u7EC4\u4EF6\u53D8\u4F53\uFF1B\u4E0D\u4F1A\u53EA\u6539\u989C\u8272\u5192\u5145\u7C7B\u578B\u3002`);
        rows2.push(`\u7B2C${change.index}\u4E2A ${target.name} \u2192 ${change.role === "secondary" ? "\u7070\u8272\u6B21\u8981" : "\u7EA2\u8272\u5371\u9669"}\u6309\u94AE\uFF1B\u6765\u6E90\uFF1A\u7EC4\u4EF6\u53D8\u4F53 ${nameOf(component2)}\uFF1B\u5C5E\u6027\uFF1A${JSON.stringify(component2.variantProperties || {})}`);
      }
      return { intent, rows: rows2, revision };
    }
    const rows = [];
    for (const change of intent.changes) {
      const target = group[change.index - 1];
      const decision = await colorDecision(target, change.color);
      rows.push(`\u7B2C${change.index}\u4E2A ${target.name} \u2192 ${change.color === "gray" ? "\u7070\u8272" : "\u7EA2\u8272"}\uFF1B\u6765\u6E90\uFF1A${decision.source}`);
    }
    return { intent, rows, revision };
  }
  async function makeFallback() {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    const f = figma.createFrame();
    f.name = "\u6309\u94AE";
    f.layoutMode = "HORIZONTAL";
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
    f.primaryAxisAlignItems = "CENTER";
    f.counterAxisAlignItems = "CENTER";
    f.paddingLeft = f.paddingRight = 16;
    f.paddingTop = f.paddingBottom = 10;
    f.cornerRadius = 6;
    f.fills = [{ type: "SOLID", color: { r: 13 / 255, g: 117 / 255, b: 232 / 255 } }];
    const text = figma.createText();
    text.fontName = { family: "Inter", style: "Regular" };
    text.characters = "\u6309\u94AE";
    text.fontSize = 14;
    text.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    f.appendChild(text);
    return f;
  }
  async function paint(n, color, decision) {
    if (decision.kind === "variant") {
      n.swapComponent(decision.component);
      return;
    }
    const old = n.fills;
    if (old === figma.mixed) throw Error(`${n.name} \u7684\u586B\u5145\u4E3A\u6DF7\u5408\u503C\uFF0C\u65E0\u6CD5\u5B89\u5168\u6539\u8272\u3002`);
    const fills = [...old];
    const index = fills.findIndex((p) => p.type === "SOLID");
    if (decision.kind === "variable") {
      const solid = index >= 0 ? fills[index] : { type: "SOLID", color: { r: 0, g: 0, b: 0 } };
      const bound = figma.variables.setBoundVariableForPaint(solid, "color", decision.variable);
      if (index >= 0) fills[index] = bound;
      else fills.unshift(bound);
    } else {
      const rgb = color === "gray" ? { r: 128 / 255, g: 128 / 255, b: 128 / 255 } : { r: 217 / 255, g: 45 / 255, b: 32 / 255 };
      const solid = { type: "SOLID", color: rgb };
      if (index >= 0) fills[index] = solid;
      else fills.unshift(solid);
    }
    n.fills = fills;
  }
  async function applyWorkflow(preview) {
    if (preview.revision !== revision) throw Error("\u843D\u70B9\u6216\u6309\u94AE\u7EC4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
    const fresh = await previewWorkflow(preview.intent, preview.candidateId);
    if (fresh.choices) throw Error("\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u6309\u94AE\u7EC4\u4EF6\u3002");
    const before = copy();
    let mutation = true;
    if (preview.intent.kind === "createButton") {
      if (!anchor || !samePage()) throw Error("\u843D\u70B9\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u62D6\u653E\u3002");
      const component2 = preview.candidateId ? await node(preview.candidateId) : null;
      if (preview.candidateId && component2?.type !== "COMPONENT") throw Error("\u6240\u9009\u7EC4\u4EF6\u5DF2\u5931\u6548\u3002");
      const made = component2?.type === "COMPONENT" ? component2.createInstance() : await makeFallback();
      figma.currentPage.appendChild(made);
      made.x = anchor.x;
      made.y = anchor.y;
      ids = [made.id];
      figma.currentPage.selection = [made];
    } else if (preview.intent.kind === "duplicateButtons") {
      const [source] = await groupNodes();
      const second = source.clone(), third = source.clone();
      figma.currentPage.appendChild(second);
      figma.currentPage.appendChild(third);
      second.x = source.x + source.width + 12;
      third.x = second.x + second.width + 12;
      second.y = third.y = source.y;
      second.name = "\u6309\u94AE 2";
      third.name = "\u6309\u94AE 3";
      source.name = "\u6309\u94AE 1";
      ids = [source.id, second.id, third.id];
      figma.currentPage.selection = [source, second, third];
    } else if (preview.intent.kind === "ensurePrimary") {
      const group = await groupNodes();
      const first = group[0];
      const main = await first.getMainComponentAsync();
      const target = main && hasRole(main, "primary") ? main : semanticVariant(first, "primary", main);
      if (!target) throw Error("\u4E3B\u8981\u6309\u94AE\u53D8\u4F53\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
      if (target.id !== main?.id) first.swapComponent(target);
      else mutation = false;
    } else if (preview.intent.kind === "setButtonTypes") {
      const group = await groupNodes();
      const targets3 = [];
      for (const change of preview.intent.changes) {
        const n = group[change.index - 1];
        const target = semanticVariant(n, change.role, await n.getMainComponentAsync());
        if (!target) throw Error("\u76EE\u6807\u7EC4\u4EF6\u53D8\u4F53\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
        targets3.push(target);
      }
      for (let i = 0; i < preview.intent.changes.length; i++) {
        const n = group[preview.intent.changes[i].index - 1];
        n.swapComponent(targets3[i]);
        if (!await n.getMainComponentAsync()) throw Error("\u6309\u94AE\u5B9E\u4F8B\u5931\u53BB\u4E3B\u7EC4\u4EF6\u8FDE\u63A5\u3002");
      }
    } else {
      const group = await groupNodes();
      const decisions = await Promise.all(preview.intent.changes.map((c) => colorDecision(group[c.index - 1], c.color)));
      for (let i = 0; i < preview.intent.changes.length; i++) {
        const c = preview.intent.changes[i];
        await paint(group[c.index - 1], c.color, decisions[i]);
      }
      for (const n of group) if (n.type === "INSTANCE" && !await n.getMainComponentAsync()) throw Error("\u6309\u94AE\u5B9E\u4F8B\u5931\u53BB\u4E3B\u7EC4\u4EF6\u8FDE\u63A5\u3002");
    }
    if (mutation) figma.commitUndo();
    history.push({ before, mutation });
    revision++;
    return fresh.rows.join("\uFF1B");
  }
  function undoWorkflow() {
    const entry = history.pop();
    if (!entry) throw Error("\u5F53\u524D\u6CA1\u6709\u53EF\u64A4\u9500\u7684\u6B65\u9AA4\u3002");
    if (entry.mutation) figma.triggerUndo();
    anchor = entry.before.anchor;
    ids = entry.before.ids;
    revision++;
    return entry.mutation ? "\u5DF2\u64A4\u9500\u6700\u8FD1\u4E00\u6B65\u8BBE\u8BA1\u4FEE\u6539\u3002" : "\u5DF2\u64A4\u9500\u6700\u8FD1\u4E00\u6B65\u72B6\u6001\u3002";
  }

  // src/object-adapters.ts
  var palette = {
    red: { r: 217 / 255, g: 45 / 255, b: 32 / 255 },
    danger: { r: 217 / 255, g: 45 / 255, b: 32 / 255 },
    blue: { r: 13 / 255, g: 117 / 255, b: 232 / 255 },
    primary: { r: 13 / 255, g: 117 / 255, b: 232 / 255 },
    gray: { r: 128 / 255, g: 128 / 255, b: 128 / 255 },
    secondary: { r: 128 / 255, g: 128 / 255, b: 128 / 255 },
    green: { r: 0, g: 128 / 255, b: 0 },
    yellow: { r: 1, g: 1, b: 0 },
    black: { r: 0, g: 0, b: 0 },
    white: { r: 1, g: 1, b: 1 }
  };
  async function colorPaint(name, source) {
    if (name.startsWith("#")) {
      const hex = name.slice(1);
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw Error("\u5341\u516D\u8FDB\u5236\u989C\u8272\u683C\u5F0F\u65E0\u6548\u3002");
      return { type: "SOLID", color: {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255
      } };
    }
    const named = name;
    const paint2 = { type: "SOLID", color: palette[named] };
    if (source === "literal") return paint2;
    const aliases2 = {
      red: /red|红/i,
      danger: /danger|destructive|危险/i,
      blue: /blue|蓝/i,
      primary: /primary|主要/i,
      gray: /gray|grey|灰/i,
      secondary: /secondary|次要/i,
      green: /green|绿/i,
      yellow: /yellow|黄/i,
      black: /black|黑/i,
      white: /white|白/i
    };
    const matches = (await figma.variables.getLocalVariablesAsync()).filter((variable) => variable.resolvedType === "COLOR" && aliases2[named].test(variable.name));
    return matches.length === 1 ? figma.variables.setBoundVariableForPaint(paint2, "color", matches[0]) : paint2;
  }
  function dimensions(node2, mode, value2, property = "size") {
    const length2 = value2?.kind === "length" ? value2.amount : null;
    if (mode === "set" && length2 === null) throw Error("\u8BBE\u7F6E\u5C3A\u5BF8\u9700\u8981\u5E26 px \u7684\u6570\u503C\u3002");
    const change = (current) => {
      if (mode === "set") return length2;
      if (length2 !== null) return current + (mode === "increase" ? length2 : -length2);
      return Math.round(current * (mode === "increase" ? 1.1 : 0.9));
    };
    let width = node2.width, height = node2.height;
    if (property === "size") {
      if (node2.width <= 0) throw Error("\u7A7A\u6587\u5B57\u8FD8\u6CA1\u6709\u53EF\u7F29\u653E\u5C3A\u5BF8\uFF1B\u8BF7\u5148\u5199\u5165\u5185\u5BB9\u3002");
      const scale = change(node2.width) / node2.width;
      width = Math.max(1, Math.round(node2.width * scale));
      height = Math.max(1, Math.round(node2.height * scale));
    } else if (property === "width") width = Math.max(1, Math.round(change(node2.width)));
    else height = Math.max(1, Math.round(change(node2.height)));
    if (node2.type === "ELLIPSE") {
      const equal = property === "height" ? height : width;
      width = equal;
      height = equal;
    }
    if (node2.type === "FRAME" && ["circle", "rectangle"].includes(node2.getPluginData("jevKind"))) {
      if (property === "size") {
        const scale = width / node2.width;
        return { apply: () => node2.rescale(scale), description: node2.name + " \u2192 " + width + "\xD7" + height + " px" };
      }
      if (node2.getPluginData("jevKind") === "circle") throw Error("\u5E26\u6587\u5B57\u7684\u5706\u5F62\u53EA\u652F\u6301\u6574\u4F53\u7B49\u6BD4\u7F29\u653E\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      const shape = node2.children.find((child) => child.type === "RECTANGLE");
      const label2 = node2.children.find((child) => child.type === "TEXT");
      if (!shape || !label2) throw Error("\u56FE\u5F62\u5BB9\u5668\u7ED3\u6784\u5DF2\u53D8\u5316\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      return {
        apply: () => {
          node2.resize(width, height);
          shape.resize(width, height);
          label2.x = (width - label2.width) / 2;
          label2.y = (height - label2.height) / 2;
        },
        description: node2.name + " \u2192 " + width + "\xD7" + height + " px"
      };
    }
    return {
      apply: () => node2.type === "TEXT" ? node2.rescale(width / node2.width) : node2.resize(width, height),
      description: node2.name + " \u2192 " + width + "\xD7" + height + " px"
    };
  }
  async function componentContent(node2, command) {
    const value2 = command.value;
    if (command.mode !== "set" || value2?.kind !== "text" || command.slot !== "content")
      throw Error("\u6587\u5B57\u547D\u4EE4\u7F3A\u5C11\u660E\u786E\u7684\u6807\u7B7E\u5185\u5BB9\u3002");
    const label2 = value2.text;
    if (node2.locked) throw Error("\u6309\u94AE\u5DF2\u9501\u5B9A\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
    const properties2 = Object.entries(node2.componentProperties).filter(([, property]) => property.type === "TEXT");
    if (properties2.length > 1) throw Error("\u7EC4\u4EF6\u5B9E\u4F8B\u6709\u591A\u4E2A\u6587\u5B57\u5C5E\u6027\uFF0C\u65E0\u6CD5\u786E\u5B9A\u5185\u5BB9\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
    if (properties2.length === 1) {
      const [name] = properties2[0];
      return { apply: () => node2.setProperties({ [name]: label2 }), description: node2.name + " \u6587\u5B57 \u2192 " + label2 };
    }
    const texts = node2.findAllWithCriteria({ types: ["TEXT"] }).filter((item) => !item.locked);
    if (texts.length > 1) throw Error("\u7EC4\u4EF6\u5185\u6709\u591A\u4E2A\u6587\u672C\u5C42\uFF0C\u65E0\u6CD5\u786E\u5B9A\u5185\u5BB9\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
    if (texts.length === 1) {
      const text = texts[0];
      const fonts = text.characters.length ? text.getRangeAllFontNames(0, text.characters.length) : text.fontName === figma.mixed ? [] : [text.fontName];
      if (!fonts.length) throw Error("\u7EC4\u4EF6\u6587\u5B57\u5B57\u4F53\u4E0D\u660E\u786E\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
      return { apply: () => {
        text.characters = label2;
      }, description: node2.name + " \u6587\u5B57 \u2192 " + label2 };
    }
    throw Error("\u7EC4\u4EF6\u5B9E\u4F8B\u6CA1\u6709\u5B89\u5168\u7684\u6587\u5B57\u5C5E\u6027\u6216\u6587\u672C\u5C42\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
  }
  function graphicShape(node2) {
    if (node2.type === "ELLIPSE" || node2.type === "RECTANGLE") return node2;
    if (node2.type === "FRAME" && ["circle", "rectangle"].includes(node2.getPluginData("jevKind"))) {
      const shape = node2.children.find((child) => child.type === "ELLIPSE" || child.type === "RECTANGLE");
      return shape?.type === "ELLIPSE" || shape?.type === "RECTANGLE" ? shape : null;
    }
    return null;
  }
  async function graphicContent(node2, command) {
    if (command.value?.kind !== "text" || command.slot !== "content" || command.mode !== "set")
      throw Error("\u56FE\u5F62\u6587\u5B57\u7F3A\u5C11\u660E\u786E\u7684\u539F\u6587\u5185\u5BB9\u3002");
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    const content = command.value.text;
    if (node2.type === "FRAME") {
      const labels = node2.children.filter((child) => child.type === "TEXT");
      if (labels.length !== 1 || node2.children.length !== 2) throw Error("\u56FE\u5F62\u6587\u5B57\u5BB9\u5668\u7ED3\u6784\u5DF2\u53D8\u5316\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      const label2 = labels[0];
      const fonts = label2.characters.length ? label2.getRangeAllFontNames(0, label2.characters.length) : label2.fontName === figma.mixed ? [] : [label2.fontName];
      if (!fonts.length) throw Error("\u56FE\u5F62\u6587\u5B57\u5B57\u4F53\u4E0D\u660E\u786E\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
      return { apply: () => {
        label2.characters = content;
        label2.x = (node2.width - label2.width) / 2;
        label2.y = (node2.height - label2.height) / 2;
      }, description: node2.name + " \u6587\u5B57 \u2192 " + content };
    }
    let wrapper;
    return { apply: () => {
      const page = figma.currentPage;
      const x = node2.x, y = node2.y, width = node2.width, height = node2.height;
      wrapper = figma.createFrame();
      wrapper.name = node2.name + " \xB7 \u6587\u5B57";
      wrapper.resize(width, height);
      wrapper.x = x;
      wrapper.y = y;
      wrapper.fills = [];
      wrapper.clipsContent = false;
      wrapper.setPluginData("jevKind", node2.type === "ELLIPSE" ? "circle" : "rectangle");
      page.appendChild(wrapper);
      wrapper.appendChild(node2);
      node2.x = 0;
      node2.y = 0;
      const label2 = figma.createText();
      label2.name = "\u5185\u5BB9";
      label2.fontName = { family: "Inter", style: "Regular" };
      label2.characters = content;
      wrapper.appendChild(label2);
      label2.x = (width - label2.width) / 2;
      label2.y = (height - label2.height) / 2;
      page.selection = [wrapper];
    }, resultingNode: () => wrapper, description: node2.name + " \u4E2D\u95F4\u6587\u5B57 \u2192 " + content };
  }
  async function graphicsProperty(node2, command) {
    if (command.property === "content") return graphicContent(node2, command);
    if (command.property === "size" || command.property === "width" || command.property === "height") {
      if (node2.type === "FRAME") {
        const labels = node2.findAllWithCriteria({ types: ["TEXT"] });
        for (const label2 of labels) {
          const fonts = label2.characters.length ? label2.getRangeAllFontNames(0, label2.characters.length) : label2.fontName === figma.mixed ? [] : [label2.fontName];
          if (!fonts.length) throw Error("\u56FE\u5F62\u6587\u5B57\u5B57\u4F53\u4E0D\u660E\u786E\uFF1B\u65E0\u6CD5\u6574\u4F53\u7F29\u653E\u3002");
          await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
        }
      }
      return dimensions(node2, command.mode, command.value, command.property);
    }
    const shape = graphicShape(node2);
    if (!shape) throw Error("\u56FE\u5F62\u5BB9\u5668\u7ED3\u6784\u5DF2\u53D8\u5316\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
    if (command.property === "cornerRadius") {
      if (shape.type !== "RECTANGLE") throw Error("\u5706\u5F62\u6682\u4E0D\u652F\u6301\u5706\u89D2\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      const old = shape.cornerRadius;
      if (typeof old !== "number") throw Error("\u6DF7\u5408\u5706\u89D2\u65E0\u6CD5\u76F4\u63A5\u8C03\u6574\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      const value2 = command.value;
      const amount = value2?.kind === "length" ? value2.amount : value2?.kind === "step" ? 2 : null;
      if (amount === null) throw Error("\u5706\u89D2\u9700\u8981\u5E26 px \u7684\u6570\u503C\u6216\u660E\u786E\u7684\u8C03\u6574\u65B9\u5411\u3002");
      const next = command.mode === "set" ? amount : Math.max(0, old + (command.mode === "increase" ? amount : -amount));
      if (next > 1e4) throw Error("\u5706\u89D2\u8D85\u51FA 0\u201310000 px\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      return { apply: () => {
        shape.cornerRadius = next;
      }, description: node2.name + " \u5706\u89D2 \u2192 " + next + " px" };
    }
    if (command.property === "strokeWidth") {
      if (command.value?.kind !== "length") throw Error("\u63CF\u8FB9\u5BBD\u5EA6\u9700\u8981\u5E26 px \u7684\u6570\u503C\u3002");
      const old = shape.strokeWeight;
      if (typeof old !== "number") throw Error("\u6DF7\u5408\u63CF\u8FB9\u5BBD\u5EA6\u65E0\u6CD5\u76F4\u63A5\u8C03\u6574\u3002");
      const amount = command.value.amount;
      const next = command.mode === "set" ? amount : old + (command.mode === "increase" ? amount : -amount);
      if (next < 0 || next > 1e3) throw Error("\u63CF\u8FB9\u5BBD\u5EA6\u8D85\u51FA 0\u20131000 px\u3002");
      return { apply: () => {
        shape.strokeWeight = next;
      }, description: node2.name + " \u63CF\u8FB9\u5BBD\u5EA6 \u2192 " + next + " px" };
    }
    if (command.property === "fill" || command.property === "stroke") {
      if (command.mode !== "set" || command.value?.kind !== "color") throw Error("\u8BF7\u660E\u786E\u8BBE\u7F6E\u7684\u989C\u8272\u3002");
      const paint2 = await colorPaint(command.value.name, command.value.source);
      return {
        apply: () => {
          if (command.property === "fill") shape.fills = [paint2];
          else shape.strokes = [paint2];
        },
        description: node2.name + " " + (command.property === "fill" ? "\u586B\u5145" : "\u63CF\u8FB9") + " \u2192 " + command.value.name
      };
    }
    throw Error(node2.type + " \u6682\u4E0D\u652F\u6301 " + command.property + "\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
  }
  var graphics = (kind) => ({
    kind,
    actions: ["create", "duplicate", "modify", "move", "arrange", "delete"],
    properties: kind === "circle" ? ["size", "fill", "stroke", "strokeWidth", "content"] : ["size", "width", "height", "cornerRadius", "fill", "stroke", "strokeWidth", "content"],
    addable: ["stroke"],
    removable: kind === "rectangle" ? ["content", "stroke", "fill", "cornerRadius"] : ["content", "stroke", "fill"],
    createRelative: true,
    matches: (node2) => (kind === "circle" ? node2.type === "ELLIPSE" : node2.type === "RECTANGLE") || node2.type === "FRAME" && node2.getPluginData("jevKind") === kind,
    async create(anchor2, role) {
      if (role) throw Error("\u56FE\u5F62\u4E0D\u652F\u6301\u6309\u94AE\u8BED\u4E49\u7C7B\u578B\u3002");
      const node2 = kind === "circle" ? figma.createEllipse() : figma.createRectangle();
      node2.name = kind === "circle" ? "\u5706\u5F62" : "\u77E9\u5F62";
      node2.resize(kind === "circle" ? 80 : 120, kind === "circle" ? 80 : 80);
      figma.currentPage.appendChild(node2);
      node2.x = anchor2.x;
      node2.y = anchor2.y;
      figma.currentPage.selection = [node2];
      return { node: node2, detail: "\u5728\u753B\u5E03 (" + Math.round(anchor2.x) + ", " + Math.round(anchor2.y) + ") \u521B\u5EFA " + node2.width + "\xD7" + node2.height + " " + node2.name + "\u3002", committed: false };
    },
    async planModify(node2, command) {
      if (node2.type !== "ELLIPSE" && node2.type !== "RECTANGLE" && node2.type !== "FRAME") throw Error("\u76EE\u6807\u4E0D\u662F\u57FA\u7840\u56FE\u5F62\u3002");
      return graphicsProperty(node2, command);
    },
    async planAdd(node2, property, value2) {
      if (property !== "stroke") throw Error("\u56FE\u5F62\u4E0D\u652F\u6301\u6DFB\u52A0 " + property + "\u3002");
      const shape = graphicShape(node2);
      if (!shape) throw Error("\u56FE\u5F62\u7ED3\u6784\u5DF2\u53D8\u5316\u3002");
      if (Array.isArray(shape.strokes) && shape.strokes.length) throw Error("\u76EE\u6807\u5DF2\u6709\u63CF\u8FB9\uFF1B\u8BF7\u6539\u989C\u8272\u6216\u5BBD\u5EA6\u3002");
      const paint2 = value2?.kind === "color" ? await colorPaint(value2.name, value2.source) : { type: "SOLID", color: { r: 0, g: 0, b: 0 } };
      return { apply: () => {
        shape.strokes = [paint2];
        shape.strokeWeight = 1;
      }, description: node2.name + " \u5DF2\u6DFB\u52A0 1 px \u63CF\u8FB9" };
    },
    async planRemove(node2, property) {
      const shape = graphicShape(node2);
      if (!shape) throw Error("\u56FE\u5F62\u7ED3\u6784\u5DF2\u53D8\u5316\u3002");
      if (property === "cornerRadius") {
        if (shape.type !== "RECTANGLE") throw Error("\u5706\u5F62\u6682\u4E0D\u652F\u6301\u5706\u89D2\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
        if (typeof shape.cornerRadius !== "number") throw Error("\u6DF7\u5408\u5706\u89D2\u65E0\u6CD5\u5B89\u5168\u79FB\u9664\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
        return { apply: () => {
          shape.cornerRadius = 0;
        }, description: node2.name + " \u5706\u89D2 \u2192 0 px" };
      }
      if (property === "stroke") {
        if (!Array.isArray(shape.strokes) || !shape.strokes.length) throw Error("\u76EE\u6807\u6CA1\u6709\u53EF\u5220\u9664\u7684\u63CF\u8FB9\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
        return { apply: () => {
          shape.strokes = [];
        }, description: node2.name + " \u5DF2\u79FB\u9664\u63CF\u8FB9" };
      }
      if (property === "fill") {
        if (!Array.isArray(shape.fills) || !shape.fills.length) throw Error("\u76EE\u6807\u6CA1\u6709\u53EF\u5220\u9664\u7684\u586B\u5145\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
        return { apply: () => {
          shape.fills = [];
        }, description: node2.name + " \u5DF2\u79FB\u9664\u586B\u5145" };
      }
      if (property !== "content") throw Error("\u56FE\u5F62\u4E0D\u652F\u6301\u5220\u9664 " + property + "\u3002");
      if (node2.type !== "FRAME") throw Error("\u8BE5\u56FE\u5F62\u6CA1\u6709\u5173\u8054\u6587\u5B57\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      const labels = node2.children.filter((child) => child.type === "TEXT");
      if (labels.length !== 1 || node2.children.length !== 2) throw Error("\u56FE\u5F62\u6587\u5B57\u5BB9\u5668\u7ED3\u6784\u5DF2\u53D8\u5316\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      let result;
      return { apply: () => {
        const x = node2.x, y = node2.y;
        figma.currentPage.appendChild(shape);
        shape.x = x;
        shape.y = y;
        node2.remove();
        figma.currentPage.selection = [shape];
        result = shape;
      }, resultingNode: () => result, description: node2.name + " \u5DF2\u5220\u9664\u5173\u8054\u6587\u5B57" };
    }
  });
  async function isButtonInstance(node2) {
    if (node2.getPluginData("jevSemantic") === "button") return true;
    try {
      const main = await node2.getMainComponentAsync();
      return /button|按钮/i.test(main?.name || "") || /button|按钮/i.test(main?.parent?.name || "");
    } catch {
      return false;
    }
  }
  var component = {
    kind: "component",
    actions: ["create", "duplicate", "modify", "move", "arrange", "delete"],
    properties: ["size", "width", "height", "semanticRole", "content"],
    addable: [],
    removable: ["content", "componentOverride"],
    createRelative: false,
    matches: (node2) => node2.type === "INSTANCE",
    async create(_anchor, role) {
      if (role && role !== "primary") throw Error("\u521B\u5EFA\u65F6\u53EA\u652F\u6301\u9ED8\u8BA4\u6216\u4E3B\u8981\u6309\u94AE\uFF1B\u521B\u5EFA\u540E\u53EF\u6539\u8BED\u4E49\u7C7B\u578B\u3002");
      const preview = await previewWorkflow({ kind: "createButton", ...role ? { role: "primary" } : {} });
      if (preview.choices) throw Error("\u627E\u5230\u591A\u4E2A\u6309\u94AE\u7EC4\u4EF6\uFF0C\u8BF7\u5148\u5728\u89C4\u5219\u9884\u89C8\u4E2D\u9009\u62E9\u6765\u6E90\u3002");
      if (!preview.candidateId) throw Error("\u5F53\u524D\u6587\u4EF6\u6CA1\u6709\u6309\u94AE\u7EC4\u4EF6\uFF1B\u8BED\u97F3\u4E0D\u4F1A\u6084\u6084\u521B\u5EFA\u666E\u901A\u56FE\u5F62\u3002");
      const detail = await applyWorkflow(preview);
      const node2 = figma.currentPage.selection[0];
      if (!node2 || !component.matches(node2)) throw Error("\u6309\u94AE\u521B\u5EFA\u540E\u65E0\u6CD5\u786E\u8BA4\u76EE\u6807\u3002");
      node2.setPluginData("jevSemantic", "button");
      return { node: node2, detail, committed: true };
    },
    async planModify(node2, command) {
      if (node2.type !== "INSTANCE") throw Error("\u76EE\u6807\u4E0D\u662F\u7EC4\u4EF6\u5B9E\u4F8B\u3002");
      if (command.property === "content") return componentContent(node2, command);
      if (command.property === "semanticRole") {
        if (command.value?.kind !== "role") throw Error("\u8BF7\u660E\u786E\u6309\u94AE\u8BED\u4E49\u7C7B\u578B\u3002");
        if (!await isButtonInstance(node2)) throw Error(node2.name + " \u4E0D\u662F\u6309\u94AE\u7EC4\u4EF6\u5B9E\u4F8B\uFF0C\u65E0\u6CD5\u5207\u6362\u8BED\u4E49\u7C7B\u578B\u3002");
        const main = await node2.getMainComponentAsync();
        const component2 = main && semanticVariant(node2, command.value.name, main);
        if (!component2) throw Error(node2.name + " \u627E\u4E0D\u5230 " + command.value.name + " \u7EC4\u4EF6\u53D8\u4F53\u3002");
        return { apply: () => node2.swapComponent(component2), description: node2.name + " \u2192 " + command.value.name };
      }
      if (command.property === "size" || command.property === "width" || command.property === "height") {
        if (command.property === "size" && command.value?.kind === "step" && node2.type === "INSTANCE") {
          const main = await node2.getMainComponentAsync();
          if (main?.parent?.type === "COMPONENT_SET") {
            const props = node2.variantProperties || {};
            const key = Object.keys(props).find((item) => /^(size|尺寸)$/i.test(item));
            const levels = ["small", "medium", "large"];
            const index = key ? levels.indexOf((props[key] || "").toLowerCase()) : -1;
            const next = index + (command.mode === "increase" ? 1 : -1);
            if (key && index >= 0 && next >= 0 && next < levels.length) {
              const variant = main.parent.children.find((item) => item.type === "COMPONENT" && item.variantProperties?.[key]?.toLowerCase() === levels[next] && Object.entries(props).every(([field, value2]) => field === key || item.variantProperties?.[field] === value2));
              if (variant?.type === "COMPONENT") return { apply: () => node2.swapComponent(variant), description: node2.name + " \u2192 " + variant.name };
            }
          }
        }
        return dimensions(node2, command.mode, command.value, command.property);
      }
      throw Error("component \u6682\u4E0D\u652F\u6301 " + command.property + "\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
    },
    async planRemove(node2, property) {
      if (node2.type !== "INSTANCE") throw Error("\u76EE\u6807\u4E0D\u662F\u7EC4\u4EF6\u5B9E\u4F8B\u3002");
      if (property === "componentOverride") {
        if (node2.overrides.length === 0) throw Error("\u7EC4\u4EF6\u6CA1\u6709\u76F4\u63A5\u8986\u76D6\u53EF\u79FB\u9664\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
        return { apply: () => node2.removeOverrides(), description: node2.name + " \u5DF2\u79FB\u9664\u5168\u90E8\u76F4\u63A5\u8986\u76D6" };
      }
      if (property !== "content") throw Error("\u7EC4\u4EF6\u4E0D\u652F\u6301\u5220\u9664 " + property + "\u3002");
      const properties2 = Object.entries(node2.componentProperties).filter(([, item]) => item.type === "TEXT");
      if (properties2.length > 1) throw Error("\u7EC4\u4EF6\u6709\u591A\u4E2A\u6587\u5B57\u5C5E\u6027\uFF0C\u65E0\u6CD5\u660E\u786E\u5220\u9664\u54EA\u4E2A\u3002");
      if (properties2.length === 1) {
        const [name] = properties2[0];
        if (properties2[0][1].value === "") throw Error("\u7EC4\u4EF6\u6587\u5B57\u5DF2\u7ECF\u4E3A\u7A7A\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
        return { apply: () => node2.setProperties({ [name]: "" }), description: node2.name + " \u5DF2\u6E05\u7A7A\u6587\u5B57\u5C5E\u6027" };
      }
      const texts = node2.findAllWithCriteria({ types: ["TEXT"] });
      if (texts.length !== 1) throw Error("\u7EC4\u4EF6\u6CA1\u6709\u552F\u4E00\u53EF\u5B89\u5168\u6E05\u7A7A\u7684\u6587\u5B57\u5C42\u3002");
      const label2 = texts[0];
      if (!label2.characters) throw Error("\u7EC4\u4EF6\u6587\u5B57\u5DF2\u7ECF\u4E3A\u7A7A\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      const fonts = label2.characters.length ? label2.getRangeAllFontNames(0, label2.characters.length) : label2.fontName === figma.mixed ? [] : [label2.fontName];
      if (!fonts.length) throw Error("\u6587\u5B57\u5B57\u4F53\u4E0D\u660E\u786E\u3002");
      await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
      return { apply: () => {
        label2.characters = "";
      }, description: node2.name + " \u5DF2\u6E05\u7A7A\u6587\u5B57\u5C42" };
    }
  };
  var textObject = {
    kind: "text",
    actions: ["create", "duplicate", "modify", "move", "arrange", "delete"],
    properties: ["content", "size", "textColor"],
    addable: [],
    removable: [],
    createRelative: true,
    matches: (node2) => node2.type === "TEXT",
    async create(anchor2, _role, content) {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      const node2 = figma.createText();
      node2.name = "\u6587\u5B57";
      node2.fontName = { family: "Inter", style: "Regular" };
      node2.characters = content?.text || "";
      figma.currentPage.appendChild(node2);
      node2.x = anchor2.x;
      node2.y = anchor2.y;
      figma.currentPage.selection = [node2];
      return { node: node2, detail: "\u5728\u753B\u5E03\u521B\u5EFA\u6587\u5B57" + (content ? "\uFF1A" + content.text : "\u3002"), committed: false };
    },
    async planModify(node2, command) {
      if (node2.type !== "TEXT") throw Error("\u76EE\u6807\u4E0D\u662F\u6587\u5B57\u8282\u70B9\u3002");
      if (command.property === "content") {
        if (command.value?.kind !== "text") throw Error("\u6587\u5B57\u5185\u5BB9\u4E0D\u660E\u786E\u3002");
        const fonts = node2.characters.length ? node2.getRangeAllFontNames(0, node2.characters.length) : node2.fontName === figma.mixed ? [] : [node2.fontName];
        if (!fonts.length) throw Error("\u6587\u5B57\u5B57\u4F53\u4E0D\u660E\u786E\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
        await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
        const content = command.value.text;
        return { apply: () => {
          node2.characters = content;
        }, description: node2.name + " \u2192 " + content };
      }
      if (command.property === "size") {
        const fonts = node2.characters.length ? node2.getRangeAllFontNames(0, node2.characters.length) : node2.fontName === figma.mixed ? [] : [node2.fontName];
        if (!fonts.length) throw Error("\u6587\u5B57\u5B57\u4F53\u4E0D\u660E\u786E\uFF1B\u65E0\u6CD5\u7F29\u653E\u3002");
        await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
        return dimensions(node2, command.mode, command.value);
      }
      if (command.property === "textColor") {
        if (command.value?.kind !== "color") throw Error("\u8BF7\u660E\u786E\u6587\u5B57\u989C\u8272\u3002");
        const paint2 = await colorPaint(command.value.name, command.value.source);
        return { apply: () => {
          node2.fills = [paint2];
        }, description: node2.name + " \u6587\u5B57\u989C\u8272 \u2192 " + command.value.name };
      }
      throw Error("\u6587\u5B57\u5BF9\u8C61\u6682\u4E0D\u652F\u6301 " + command.property + "\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
    }
  };
  var adapters = { component, circle: graphics("circle"), rectangle: graphics("rectangle"), text: textObject };
  function adapterFor(node2) {
    return adapters.circle.matches(node2) ? adapters.circle : adapters.rectangle.matches(node2) ? adapters.rectangle : component.matches(node2) ? component : textObject.matches(node2) ? textObject : null;
  }
  function requireAction(adapter, action) {
    if (!adapter.actions.includes(action)) throw Error(adapter.kind + " \u6682\u4E0D\u652F\u6301 " + action + "\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
  }
  function requireProperty(adapter, property) {
    if (!adapter.properties.includes(property)) throw Error(adapter.kind + " \u6682\u4E0D\u652F\u6301 " + property + "\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
  }
  function requireAddable(adapter, property) {
    if (!adapter.addable.includes(property) || !adapter.planAdd)
      throw Error(adapter.kind + " \u6682\u4E0D\u652F\u6301\u6DFB\u52A0 " + property + "\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
  }
  function requireRemovable(adapter, property) {
    if (property === "width" || property === "height" || property === "size")
      throw Error("\u5BBD\u9AD8\u548C\u5C3A\u5BF8\u662F\u5BF9\u8C61\u56FA\u6709\u5C5E\u6027\uFF0C\u4E0D\u80FD\u5220\u9664\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
    if (!adapter.removable.includes(property) || !adapter.planRemove)
      throw Error(adapter.kind + " \u6682\u4E0D\u652F\u6301\u5220\u9664 " + property + "\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
  }

  // src/live-edit.ts
  var ids2 = [];
  var lastChange = null;
  var history2 = [];
  function snapshot(nodes) {
    return nodes.map((node2) => ({
      id: node2.id,
      name: node2.name,
      x: node2.x,
      y: node2.y,
      width: node2.width,
      height: node2.height,
      fills: "fills" in node2 ? JSON.stringify(node2.fills) : "",
      strokes: "strokes" in node2 ? JSON.stringify(node2.strokes) : "",
      strokeWeight: "strokeWeight" in node2 && typeof node2.strokeWeight === "number" ? node2.strokeWeight : null,
      content: node2.type === "INSTANCE" || node2.type === "FRAME" ? JSON.stringify({
        properties: node2.type === "INSTANCE" ? node2.componentProperties : null,
        labels: node2.findAllWithCriteria({ types: ["TEXT"] }).map((text) => text.characters)
      }) : node2.type === "TEXT" ? node2.characters : ""
    }));
  }
  function describe(states) {
    return states.map((node2) => node2.name + " " + Math.round(node2.width) + "\xD7" + Math.round(node2.height) + " @(" + Math.round(node2.x) + "," + Math.round(node2.y) + ")" + (node2.content ? " \u5185\u5BB9=" + node2.content.slice(0, 100) : "")).join("\uFF1B");
  }
  async function active() {
    const candidates = ids2.length ? await Promise.all(ids2.map((id) => figma.getNodeByIdAsync(id))) : figma.currentPage.selection;
    const objects = candidates.filter((node2) => !!node2 && (node2.type === "INSTANCE" || node2.type === "FRAME" || node2.type === "ELLIPSE" || node2.type === "RECTANGLE" || node2.type === "TEXT") && node2.parent?.id === figma.currentPage.id && !!adapterFor(node2));
    if (objects.length !== candidates.length) throw Error("\u7F16\u8F91\u5BF9\u8C61\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u76EE\u6807\u3002");
    return objects;
  }
  async function conversationContext() {
    let objects = [];
    try {
      objects = await active();
    } catch {
      ids2 = [];
    }
    const semantics = await Promise.all(objects.map(async (node2) => node2.type === "INSTANCE" && await isButtonInstance(node2) ? "button" : null));
    return {
      pageId: figma.currentPage.id,
      activeCount: objects.length,
      selectedCount: figma.currentPage.selection.filter((node2) => node2.parent?.id === figma.currentPage.id && !!adapterFor(node2)).length,
      selectedMatchesActive: figma.currentPage.selection.length === 1 && objects.length === 1 && figma.currentPage.selection[0].id === objects[0].id,
      activeObjects: objects.map((node2) => adapterFor(node2).kind),
      activeSemantics: semantics,
      hasAnchor: !!currentAnchor(),
      lastEdit: lastChange ? {
        action: lastChange.action,
        property: lastChange.property,
        before: describe(lastChange.before),
        after: describe(lastChange.after)
      } : null
    };
  }
  function targets2(group, target) {
    if (target === "named") throw Error("\u6309\u540D\u79F0\u6307\u5B9A\u5BF9\u8C61\u5C1A\u672A\u5B9E\u73B0\uFF1B\u8BF7\u9009\u4E2D\u5BF9\u8C61\u6216\u4F7F\u7528\u5E8F\u53F7\u3002");
    if (target === "selected") {
      const selected2 = figma.currentPage.selection;
      if (selected2.length !== 1 || selected2[0].parent?.id !== figma.currentPage.id || !adapterFor(selected2[0]))
        throw Error("\u8BF7\u5728\u5F53\u524D\u9875\u9762\u660E\u786E\u5355\u9009\u4E00\u4E2A\u53EF\u7F16\u8F91\u5BF9\u8C61\u3002");
      return [selected2[0]];
    }
    if (!group.length) throw Error("\u8BF7\u5148\u521B\u5EFA\u6216\u9009\u4E2D\u7F16\u8F91\u5BF9\u8C61\u3002");
    if (target === "all") return group;
    if (target === "previous") throw Error("\u201C\u521A\u521B\u5EFA\u7684\u5BF9\u8C61\u201D\u53EA\u80FD\u5728\u540C\u4E00\u53E5\u4F9D\u8D56\u7F16\u8F91\u4E2D\u4F7F\u7528\u3002");
    if (target === "current") {
      const selected2 = figma.currentPage.selection;
      if (selected2.length === 1 && selected2[0].parent?.id === figma.currentPage.id && adapterFor(selected2[0]))
        return [selected2[0]];
      if (group.length === 1) return [group[0]];
      throw Error("\u5F53\u524D\u6709\u591A\u4E2A\u5BF9\u8C61\uFF0C\u65E0\u6CD5\u786E\u5B9A\u201C\u8FD9\u4E2A\u201D\u662F\u54EA\u4E00\u4E2A\uFF1B\u8BF7\u9009\u4E2D\u5BF9\u8C61\u6216\u8BF4\u5E8F\u53F7\u3002");
    }
    if (target === "last") return [group[group.length - 1]];
    if (target === "first") return [group[0]];
    if (group.length < 3 || group.length % 2 === 0) throw Error("\u65E0\u6CD5\u660E\u786E\u5B9A\u4F4D\u201C\u4E2D\u95F4\u90A3\u4E2A\u201D\uFF1B\u8BF7\u9009\u4E2D\u76EE\u6807\u6216\u8BF4\u5E8F\u53F7\u3002");
    return [group[Math.floor(group.length / 2)]];
  }
  async function checkedTargets(group, target, parameters) {
    const nodes = targets2(group, target);
    for (const node2 of nodes) {
      const adapter = adapterFor(node2);
      if (parameters.expectedObject && adapter.kind !== parameters.expectedObject)
        throw Error("\u76EE\u6807\u5BF9\u8C61\u7C7B\u578B\u4E0E\u8BED\u97F3\u6240\u6307\u4E0D\u4E00\u81F4\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      if (parameters.expectedSemantic === "button" && (node2.type !== "INSTANCE" || !await isButtonInstance(node2)))
        throw Error("\u76EE\u6807\u4E0D\u662F\u6309\u94AE\u7EC4\u4EF6\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
    }
    return nodes;
  }
  function remember(beforeIds, previous, usedWorkflow, record2) {
    history2.push({ ids: beforeIds, lastChange: previous, usedWorkflow });
    lastChange = record2;
  }
  function record(action, property, before, after) {
    return { pageId: figma.currentPage.id, action, property, targetIds: after.map((node2) => node2.id), before, after: snapshot(after) };
  }
  function positionForCreate(position, group, kind) {
    if (position.kind === "anchor") {
      const anchor2 = currentAnchor();
      if (!anchor2) throw Error("\u8BF7\u5148\u628A\u201C\u521B\u5EFA\u4F4D\u7F6E\u201D\u62D6\u5230\u5F53\u524D\u9875\u9762\uFF1B\u65E0\u6CD5\u731C\u6D4B\u201C\u8FD9\u91CC\u201D\u3002");
      return anchor2;
    }
    const adapter = adapters[kind.object];
    if (!adapter.createRelative) throw Error(kind.object + " \u6682\u4E0D\u652F\u6301\u76F8\u5BF9\u5BF9\u8C61\u521B\u5EFA\uFF1B\u8BF7\u5148\u8BBE\u7F6E\u753B\u5E03\u843D\u70B9\u3002");
    const [reference] = targets2(group, position.reference);
    return { x: reference.x, y: reference.y, pageId: figma.currentPage.id, reference };
  }
  function placeRelative(created, reference, direction) {
    const gap = 12;
    if (direction === "right") {
      created.x = reference.x + reference.width + gap;
      created.y = reference.y;
    } else if (direction === "left") {
      created.x = reference.x - created.width - gap;
      created.y = reference.y;
    } else if (direction === "below") {
      created.x = reference.x;
      created.y = reference.y + reference.height + gap;
    } else {
      created.x = reference.x;
      created.y = reference.y - created.height - gap;
    }
  }
  async function planModification(command, group) {
    const nodes = await checkedTargets(group, command.target, command);
    const changes = await Promise.all(nodes.map(async (node2) => {
      const adapter = adapterFor(node2);
      if (command.expectedObject && adapter.kind !== command.expectedObject)
        throw Error("\u76EE\u6807\u5BF9\u8C61\u7C7B\u578B\u4E0E\u8BED\u97F3\u6240\u6307\u4E0D\u4E00\u81F4\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      if (command.expectedSemantic === "button" && (node2.type !== "INSTANCE" || !await isButtonInstance(node2)))
        throw Error("\u76EE\u6807\u4E0D\u662F\u6309\u94AE\u7EC4\u4EF6\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
      requireAction(adapter, "modify");
      requireProperty(adapter, command.property);
      return adapter.planModify(node2, command);
    }));
    return { nodes, changes };
  }
  async function executeStructuralEdit(command) {
    const target = command.target;
    if (!target) throw Error("\u8FD9\u9879\u7F16\u8F91\u7F3A\u5C11\u76EE\u6807\u3002");
    const group = await active();
    const nodes = await checkedTargets(group, target, command.parameters);
    const beforeIds = [...ids2], previous = lastChange, before = snapshot(nodes);
    if (command.operation === "delete" && command.operand === "object" || command.operation === "delete" && command.operand === "text" && nodes.every((node2) => node2.type === "TEXT")) {
      for (const node2 of nodes) requireAction(adapterFor(node2), "delete");
      for (const node2 of nodes) node2.remove();
      ids2 = target === "selected" || target === "current" && nodes.every((node2) => !ids2.includes(node2.id)) ? [] : ids2.filter((id) => !nodes.some((node2) => node2.id === id));
      figma.currentPage.selection = [];
      figma.commitUndo();
      remember(beforeIds, previous, false, record("edit", void 0, before, []));
      return "\u5DF2\u5220\u9664 " + nodes.length + " \u4E2A\u8BBE\u8BA1\u5BF9\u8C61\u3002";
    }
    const property = command.operand === "text" ? "content" : command.parameters.property;
    if (!property) throw Error("\u8BF7\u8BF4\u660E\u8981\u6DFB\u52A0\u6216\u5220\u9664\u7684\u5C5E\u6027\u3002");
    const changes = await Promise.all(nodes.map(async (node2) => {
      const adapter = adapterFor(node2);
      if (command.operation === "add") {
        requireAddable(adapter, property);
        const value2 = command.parameters.value;
        return adapter.planAdd(node2, property, value2?.kind === "text" ? void 0 : value2);
      }
      requireRemovable(adapter, property);
      return adapter.planRemove(node2, property);
    }));
    for (const change of changes) change.apply();
    const after = changes.map((change, index) => change.resultingNode?.() || nodes[index]);
    if (nodes.some((node2) => !ids2.includes(node2.id))) ids2 = after.map((node2) => node2.id);
    else ids2 = ids2.map((id) => {
      const index = nodes.findIndex((node2) => node2.id === id);
      return index >= 0 ? after[index].id : id;
    });
    figma.commitUndo();
    remember(beforeIds, previous, false, record("edit", property, before, after));
    return changes.map((change) => change.description).join("\uFF1B");
  }
  async function executeEdit(command) {
    const { operation, operand, target, parameters: p } = command;
    if (operation === "undo") return undoLive();
    if (operation === "add" && operand === "object") {
      if (!p.object || !p.position) throw Error("\u521B\u5EFA\u5BF9\u8C61\u7F3A\u5C11\u7C7B\u578B\u6216\u4F4D\u7F6E\u3002");
      return executeLive({ kind: "create", object: p.object, position: p.position, role: p.role, content: p.content });
    }
    if ((operation === "add" || operation === "set") && operand === "text") {
      if (!target || p.value?.kind !== "text") throw Error("\u6587\u5B57\u547D\u4EE4\u7F3A\u5C11\u76EE\u6807\u6216\u539F\u6587\u3002");
      return executeLive({
        kind: "modify",
        target,
        property: "content",
        mode: "set",
        value: p.value,
        slot: "content",
        placement: p.placement,
        expectedObject: p.expectedObject,
        expectedSemantic: p.expectedSemantic
      });
    }
    if ((operation === "set" || operation === "adjust") && operand === "property") {
      if (!target || !p.property || !p.mode) throw Error("\u5C5E\u6027\u547D\u4EE4\u7F3A\u5C11\u76EE\u6807\u6216\u53C2\u6570\u3002");
      return executeLive({
        kind: "modify",
        target,
        property: p.property,
        mode: p.mode,
        value: p.value,
        expectedObject: p.expectedObject,
        expectedSemantic: p.expectedSemantic
      });
    }
    if (operation === "duplicate" && operand === "object") {
      if (!target || !p.additional || !p.arrangement) throw Error("\u590D\u5236\u547D\u4EE4\u7F3A\u5C11\u6570\u91CF\u6216\u6392\u5217\u3002");
      return executeLive({ kind: "duplicate", target, additional: p.additional, arrangement: p.arrangement });
    }
    if (operation === "move" && operand === "object") {
      if (!target || !p.direction || !p.distance || !["left", "right", "above", "below"].includes(p.direction))
        throw Error("\u79FB\u52A8\u547D\u4EE4\u7F3A\u5C11\u65B9\u5411\u6216\u8DDD\u79BB\u3002");
      return executeLive({ kind: "move", target, direction: p.direction, distance: p.distance });
    }
    if (operation === "arrange" && operand === "object") {
      if (!target || !p.direction || !["horizontal", "vertical"].includes(p.direction)) throw Error("\u6392\u5217\u65B9\u5411\u4E0D\u660E\u786E\u3002");
      return executeLive({ kind: "arrange", target, direction: p.direction });
    }
    if (operation === "delete" || operation === "add" && operand === "property") return executeStructuralEdit(command);
    throw Error("\u8FD9\u9879\u64CD\u4F5C\u4E0E\u64CD\u4F5C\u5BF9\u8C61\u7684\u7EC4\u5408\u5C1A\u4E0D\u652F\u6301\uFF1B\u753B\u5E03\u672A\u4FEE\u6539\u3002");
  }
  async function executeLive(command) {
    if (command.kind === "edit") return executeEdit(command);
    if (command.kind === "sequence") {
      const startingIds = [...ids2], startingEdit = lastChange, startingHistory = history2.length;
      const before2 = snapshot(await active());
      const results = [];
      try {
        for (const step of command.commands) {
          const resolved = (step.kind === "modify" || step.kind === "edit") && step.target === "previous" ? { ...step, target: "current" } : step;
          results.push(await executeLive(resolved));
        }
      } catch (error) {
        while (history2.length > startingHistory) undoLive();
        throw Error("\u4F9D\u8D56\u7F16\u8F91\u672A\u5168\u90E8\u5B8C\u6210\uFF0C\u5DF2\u56DE\u6EDA\uFF1A" + (error instanceof Error ? error.message : String(error)));
      }
      const steps = history2.splice(startingHistory);
      history2.push({ ids: startingIds, lastChange: startingEdit, usedWorkflow: false, steps });
      lastChange = record("sequence", void 0, before2, await active());
      return results.join("\uFF1B");
    }
    if (command.kind === "undo") return undoLive(command.reason === "correction" ? "size" : void 0);
    if (command.kind === "modify" && command.mode === "restore") return undoLive(command.property);
    const beforeIds = [...ids2], previous = lastChange;
    const group = await active();
    if (command.kind === "create") {
      const location = positionForCreate(command.position, group, command);
      const adapter = adapters[command.object];
      requireAction(adapter, "create");
      const result = await adapter.create(location, command.role, command.content);
      if (command.position.kind === "relative") placeRelative(result.node, location.reference, command.position.direction);
      if (!result.committed) figma.commitUndo();
      ids2 = [result.node.id];
      remember(beforeIds, previous, result.committed, record("create", void 0, [], [result.node]));
      return result.detail;
    }
    if (!group.length) throw Error("\u8BF7\u5148\u521B\u5EFA\u6216\u9009\u4E2D\u7F16\u8F91\u5BF9\u8C61\u3002");
    if (command.kind === "duplicate") {
      const source = targets2(group, command.target);
      if (source.length !== 1) throw Error("\u4E00\u6B21\u590D\u5236\u8BF7\u660E\u786E\u6307\u5B9A\u4E00\u4E2A\u6765\u6E90\u5BF9\u8C61\u3002");
      const adapter = adapterFor(source[0]);
      requireAction(adapter, "duplicate");
      if (group.length + command.additional > 20) throw Error("\u4E00\u6B21\u6700\u591A\u652F\u6301 20 \u4E2A\u5BF9\u8C61\u3002");
      const before2 = snapshot(group);
      const copies = Array.from({ length: command.additional }, () => source[0].clone());
      for (const copy2 of copies) figma.currentPage.appendChild(copy2);
      const result = [...group, ...copies];
      arrange(result, command.arrangement);
      ids2 = result.map((node2) => node2.id);
      figma.currentPage.selection = result;
      figma.commitUndo();
      remember(beforeIds, previous, false, record("duplicate", void 0, before2, result));
      return "\u5DF2\u589E\u52A0 " + command.additional + " \u4E2A\u5BF9\u8C61\uFF0C\u73B0\u6709 " + result.length + " \u4E2A\uFF0C" + (command.arrangement === "horizontal" ? "\u6A2A\u5411" : "\u7EB5\u5411") + "\u6392\u5217\u3002";
    }
    if (command.kind === "arrange") {
      const nodes2 = targets2(group, command.target);
      if (nodes2.length < 2) throw Error("\u6392\u5217\u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u5BF9\u8C61\u3002");
      for (const node2 of nodes2) requireAction(adapterFor(node2), "arrange");
      const before2 = snapshot(nodes2);
      arrange(nodes2, command.direction);
      figma.commitUndo();
      remember(beforeIds, previous, false, record("arrange", "layout", before2, nodes2));
      return nodes2.length + " \u4E2A\u5BF9\u8C61\u5DF2" + (command.direction === "horizontal" ? "\u6A2A\u5411" : "\u7EB5\u5411") + "\u6392\u5217\u3002";
    }
    if (command.kind === "move") {
      const nodes2 = targets2(group, command.target);
      for (const node2 of nodes2) requireAction(adapterFor(node2), "move");
      const before2 = snapshot(nodes2);
      const delta = command.distance.amount;
      for (const node2 of nodes2) {
        if (command.direction === "left") node2.x -= delta;
        else if (command.direction === "right") node2.x += delta;
        else if (command.direction === "above") node2.y -= delta;
        else node2.y += delta;
      }
      figma.commitUndo();
      remember(beforeIds, previous, false, record("move", void 0, before2, nodes2));
      return nodes2.length + " \u4E2A\u5BF9\u8C61\u5DF2\u5411" + command.direction + "\u79FB\u52A8 " + delta + " px\u3002";
    }
    const edits = command.kind === "batch" ? command.commands.map((item) => {
      if (item.kind === "modify") return item;
      if (item.kind !== "edit" || item.operand !== "property" || !item.target || !item.parameters.property || !item.parameters.mode)
        throw Error("\u540C\u53E5\u72EC\u7ACB\u7F16\u8F91\u53EA\u652F\u6301\u660E\u786E\u7684\u5C5E\u6027\u4FEE\u6539\u3002");
      return {
        kind: "modify",
        target: item.target,
        property: item.parameters.property,
        mode: item.parameters.mode,
        value: item.parameters.value,
        expectedObject: item.parameters.expectedObject,
        expectedSemantic: item.parameters.expectedSemantic
      };
    }) : [command];
    const planned = await Promise.all(edits.map((edit) => planModification(edit, group)));
    const nodes = planned.flatMap((item) => item.nodes);
    if (new Set(nodes.map((node2) => node2.id)).size !== nodes.length) throw Error("\u540C\u4E00\u53E5\u8BDD\u5BF9\u540C\u4E00\u5BF9\u8C61\u6709\u51B2\u7A81\u4FEE\u6539\u3002");
    const before = snapshot(nodes);
    for (const item of planned) for (const change of item.changes) change.apply();
    const finalNodes = planned.flatMap((item) => item.changes.map((change, index) => change.resultingNode?.() || item.nodes[index]));
    if (nodes.some((node2) => !ids2.includes(node2.id))) ids2 = finalNodes.map((node2) => node2.id);
    else if (finalNodes.some((node2, index) => node2.id !== nodes[index].id)) {
      ids2 = ids2.map((id) => {
        const index = nodes.findIndex((node2) => node2.id === id);
        return index >= 0 ? finalNodes[index].id : id;
      });
    }
    figma.commitUndo();
    const property = edits.length === 1 ? edits[0].property : void 0;
    remember(beforeIds, previous, false, record(command.kind, property, before, finalNodes));
    return planned.flatMap((item) => item.changes.map((change) => change.description)).join("\uFF1B");
  }
  function arrange(nodes, direction) {
    let position = direction === "horizontal" ? nodes[0].x : nodes[0].y;
    for (const node2 of nodes) {
      if (direction === "horizontal") {
        node2.x = position;
        node2.y = nodes[0].y;
        position += node2.width + 12;
      } else {
        node2.y = position;
        node2.x = nodes[0].x;
        position += node2.height + 12;
      }
    }
  }
  function undoLive(expectedProperty) {
    const entry = history2[history2.length - 1];
    if (!entry || !lastChange) throw Error("\u6CA1\u6709\u53EF\u64A4\u56DE\u7684\u4E0A\u4E00\u53E5\u7F16\u8F91\u3002");
    if (lastChange.pageId !== figma.currentPage.id) throw Error("\u9875\u9762\u5DF2\u5207\u6362\uFF0C\u65E0\u6CD5\u64A4\u56DE\u4E0A\u4E00\u53E5\u3002");
    if (expectedProperty && lastChange.property !== expectedProperty) throw Error("\u4E0A\u4E00\u53E5\u4E0D\u662F\u8BE5\u5C5E\u6027\u7684\u4FEE\u6539\uFF0C\u4E0D\u80FD\u8FD9\u6837\u6062\u590D\u3002");
    history2.pop();
    if (entry.steps) {
      for (const step of [...entry.steps].reverse()) {
        if (step.usedWorkflow) undoWorkflow();
        else figma.triggerUndo();
      }
    } else if (entry.usedWorkflow) undoWorkflow();
    else figma.triggerUndo();
    ids2 = entry.ids;
    lastChange = entry.lastChange;
    return "\u5DF2\u9000\u56DE\u4E0A\u4E00\u53E5\u7F16\u8F91\u3002";
  }

  // src/code.ts
  var pending = null;
  var canUndo = false;
  var undoOrder = [];
  var processedVoiceSteps = /* @__PURE__ */ new Set();
  figma.showUI(__html__, { width: 400, height: 260, themeColors: true });
  var send = (type, data = {}) => figma.ui.postMessage({ type, ...data });
  var selected = () => figma.currentPage.selection;
  var path = (n) => {
    const names = [n.name];
    let p = n.parent;
    while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
      names.unshift(p.name);
      p = p.parent;
    }
    return names.join(" / ");
  };
  var label = (n) => `${n.name} \xB7 ${n.type}`;
  var isAuto = (n) => "layoutMode" in n && n.layoutMode !== "NONE" && n.layoutMode !== "GRID";
  var isSized = (n) => "resize" in n && "width" in n;
  var siblings = (nodes) => nodes.length > 0 && nodes.every((n) => n.parent === nodes[0].parent);
  function context() {
    const nodes = selected();
    send("context", { items: nodes.map((n) => ({ id: n.id, name: n.name, path: path(n), type: n.type, parent: n.parent?.type === "PAGE" ? "Page" : n.parent?.name, layout: "layoutMode" in n ? n.layoutMode : void 0, size: "width" in n ? `${Math.round(n.width)} \xD7 ${Math.round(n.height)}` : void 0, variant: n.type === "INSTANCE" ? n.variantProperties : void 0 })), count: nodes.length, anchor: anchorLabel(), canUndo: undoOrder.length > 0 });
  }
  figma.on("selectionchange", () => {
    pending = null;
    send("clearPlan");
    context();
  });
  figma.on("drop", (event) => {
    if (event.dropMetadata?.kind === "creation-anchor" && event.node.type !== "PAGE") {
      send("error", { message: "\u8BF7\u628A\u521B\u5EFA\u4F4D\u7F6E\u62D6\u5230\u5F53\u524D\u9875\u9762\u7684\u7A7A\u767D\u753B\u5E03\u3002" });
      return false;
    }
    if (recordDrop(event)) {
      undoOrder.push("workflow");
      pending = null;
      send("clearPlan");
      context();
      send("done", { message: `\u521B\u5EFA\u4F4D\u7F6E\u5DF2\u8BBE\u4E3A ${anchorLabel()}\u3002\u73B0\u5728\u53EF\u4EE5\u8BF4\u201C\u5728\u8FD9\u91CC\u52A0\u4E00\u4E2A\u5706\u201D\u3002`, canUndo: true });
      return false;
    }
    return true;
  });
  var jevRequestId = 0;
  var jevPending = /* @__PURE__ */ new Map();
  function requestJev(text, context2) {
    return new Promise((resolve, reject) => {
      const id = ++jevRequestId;
      const timer = setTimeout(() => {
        jevPending.delete(id);
        reject(Error("\u672C\u673A Jev \u670D\u52A1\u54CD\u5E94\u8D85\u65F6\uFF0C\u672C\u6B65\u672A\u6267\u884C\u3002"));
      }, 5e4);
      jevPending.set(id, { resolve, reject, timer });
      send("jevRequest", { id, text, context: context2 });
    });
  }
  context();
  async function plan(intent, nodes) {
    if (!nodes.length) throw Error("\u8BF7\u5148\u5728\u753B\u5E03\u4E2D\u9009\u62E9\u76EE\u6807\u56FE\u5C42\u3002");
    const rows = [];
    if (intent.kind === "align" && nodes.length > 1) {
      if (!siblings(nodes)) throw Error("\u591A\u9009\u5BF9\u9F50\u9700\u8981\u540C\u4E00\u7236\u7EA7\u4E0B\u7684\u56FE\u5C42\u3002");
      if (nodes.some((n) => n.parent && "layoutMode" in n.parent && n.parent.layoutMode !== "NONE")) throw Error("Auto Layout \u5B50\u5C42\u8BF7\u8C03\u6574\u7236\u7EA7\u5BF9\u9F50\u3002");
      rows.push(`${nodes.length} \u4E2A\u56FE\u5C42${intent.axis === "horizontal" ? "\u6C34\u5E73" : "\u5782\u76F4"}${intent.value === "MIN" ? "\u8D77\u70B9\u5BF9\u9F50" : intent.value === "MAX" ? "\u7EC8\u70B9\u5BF9\u9F50" : "\u5C45\u4E2D\u5BF9\u9F50"}`);
      return rows;
    }
    if (intent.kind === "distribute") {
      if (nodes.length < 3 || !siblings(nodes)) throw Error("\u7B49\u8DDD\u5206\u5E03\u9700\u8981\u9009\u4E2D\u540C\u4E00\u7236\u7EA7\u4E0B\u81F3\u5C11 3 \u4E2A\u56FE\u5C42\u3002");
      if (nodes.some((n) => n.parent && "layoutMode" in n.parent && n.parent.layoutMode !== "NONE")) throw Error("Auto Layout \u5B50\u5C42\u7531\u5E03\u5C40\u7BA1\u7406\uFF1B\u8BF7\u8C03\u6574\u7236\u7EA7\u95F4\u8DDD\u3002");
      if (nodes.some((n) => !isSized(n))) throw Error("\u9009\u533A\u5305\u542B\u4E0D\u53EF\u5B9A\u4F4D\u7684\u8282\u70B9\u3002");
      rows.push(`${nodes.length} \u4E2A\u56FE\u5C42\u6CBF${intent.value === "horizontal" ? "\u6C34\u5E73" : "\u5782\u76F4"}\u65B9\u5411\u7B49\u8DDD\u5206\u5E03\uFF0C\u4FDD\u6301\u9996\u5C3E\u4F4D\u7F6E`);
      return rows;
    }
    if (intent.kind === "rename" && nodes.length > 1 && !intent.pattern.includes("{n}")) throw Error("\u6279\u91CF\u91CD\u547D\u540D\u8BF7\u5728\u540D\u79F0\u4E2D\u52A0\u5165 {n} \u5E8F\u53F7\uFF0C\u4F8B\u5982\u201C\u6309\u94AE {n}\u201D\u3002");
    const styles = intent.kind === "style" ? await Promise.all([figma.getLocalTextStylesAsync(), figma.getLocalPaintStylesAsync()]) : null;
    const vars = intent.kind === "variable" ? await figma.variables.getLocalVariablesAsync() : null;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      switch (intent.kind) {
        case "direction":
          if (!("layoutMode" in n)) throw Error(`${label(n)} \u4E0D\u652F\u6301 Auto Layout\u3002`);
          rows.push(`${label(n)}\uFF1A\u5E03\u5C40\u65B9\u5411 \u2192 ${intent.value === "HORIZONTAL" ? "\u6A2A\u5411" : "\u7EB5\u5411"}`);
          break;
        case "gap":
        case "padding":
          if (!isAuto(n)) throw Error(`${label(n)} \u4E0D\u662F\u5DF2\u542F\u7528\u7684 Auto Layout\u3002`);
          rows.push(`${label(n)}\uFF1A${intent.kind === "gap" ? "\u95F4\u8DDD" : "\u56DB\u8FB9\u5185\u8FB9\u8DDD"} \u2192 ${intent.value} px`);
          break;
        case "width":
        case "height":
          if (!isSized(n) || n.type === "INSTANCE") throw Error(`${label(n)} \u4E0D\u652F\u6301\u76F4\u63A5\u6539\u5C3A\u5BF8\uFF1B\u5B9E\u4F8B\u8BF7\u4F7F\u7528\u7EC4\u4EF6\u53D8\u4F53\u3002`);
          rows.push(`${label(n)}\uFF1A${intent.kind === "width" ? "\u5BBD\u5EA6" : "\u9AD8\u5EA6"} \u2192 ${intent.value} px`);
          break;
        case "align":
          if (isAuto(n)) rows.push(`${label(n)}\uFF1A${intent.axis === "horizontal" ? "\u6C34\u5E73" : "\u5782\u76F4"}\u5B50\u9879\u5BF9\u9F50 \u2192 ${intent.value}`);
          else throw Error(`${label(n)} \u4E0D\u662F Auto Layout\uFF1B\u8BF7\u9009\u4E2D\u7236\u7EA7\u5BB9\u5668\u3002`);
          break;
        case "style": {
          const matches = [...styles[0], ...styles[1]].filter((s2) => s2.name.toLowerCase() === intent.name.toLowerCase());
          if (matches.length !== 1) throw Error(`\u672C\u5730\u6837\u5F0F\u201C${intent.name}\u201D${matches.length ? "\u6709\u91CD\u540D" : "\u672A\u627E\u5230"}\u3002`);
          const s = matches[0];
          if (s.type === "TEXT" && n.type !== "TEXT") throw Error(`${label(n)} \u4E0D\u662F\u6587\u5B57\u56FE\u5C42\u3002`);
          if (s.type === "PAINT" && !("fills" in n)) throw Error(`${label(n)} \u4E0D\u652F\u6301\u586B\u5145\u6837\u5F0F\u3002`);
          rows.push(`${label(n)}\uFF1A\u5E94\u7528\u672C\u5730${s.type === "TEXT" ? "\u6587\u5B57" : "\u586B\u5145"}\u6837\u5F0F ${s.name}`);
          break;
        }
        case "variable": {
          const matches = vars.filter((v) => v.name.toLowerCase() === intent.name.toLowerCase());
          if (matches.length !== 1) throw Error(`\u672C\u5730\u6570\u503C\u53D8\u91CF\u201C${intent.name}\u201D${matches.length ? "\u6709\u91CD\u540D" : "\u672A\u627E\u5230"}\u3002`);
          if (matches[0].resolvedType === "FLOAT" && !isAuto(n)) throw Error(`${label(n)} \u9700\u4E3A Auto Layout\uFF0C\u624D\u80FD\u7ED1\u5B9A\u6570\u503C\u53D8\u91CF\u3002`);
          if (matches[0].resolvedType === "COLOR") {
            if (!("fills" in n)) throw Error(`${label(n)} \u4E0D\u652F\u6301\u586B\u5145\u989C\u8272\u3002`);
            const fills = n.fills;
            if (fills === figma.mixed || !fills.some((p) => p.type === "SOLID")) throw Error(`${label(n)} \u6CA1\u6709\u53EF\u7ED1\u5B9A\u7684\u7EAF\u8272\u586B\u5145\u3002`);
          }
          if (!["FLOAT", "COLOR"].includes(matches[0].resolvedType)) throw Error("\u76EE\u524D\u4EC5\u652F\u6301\u6570\u503C\u548C\u989C\u8272\u53D8\u91CF\u3002");
          rows.push(`${label(n)}\uFF1A${matches[0].resolvedType === "COLOR" ? "\u586B\u5145\u989C\u8272" : "\u95F4\u8DDD"}\u7ED1\u5B9A\u5230\u672C\u5730\u53D8\u91CF ${matches[0].name}`);
          break;
        }
        case "sizing": {
          if (!("layoutSizingHorizontal" in n)) throw Error(`${label(n)} \u4E0D\u652F\u6301 Hug/Fill\u3002`);
          if (intent.value === "FILL" && (!n.parent || !("layoutMode" in n.parent) || n.parent.layoutMode === "NONE" || n.parent.layoutMode === "GRID")) throw Error(`${label(n)} \u7684 Fill \u9700\u8981 Auto Layout \u7236\u7EA7\u3002`);
          if (intent.value === "HUG" && !isAuto(n) && n.type !== "TEXT") throw Error(`${label(n)} \u7684 Hug \u9700\u8981 Auto Layout \u5BB9\u5668\u6216\u6587\u5B57\u3002`);
          rows.push(`${label(n)}\uFF1A${intent.axis === "horizontal" ? "\u5BBD\u5EA6" : "\u9AD8\u5EA6"} \u2192 ${intent.value}`);
          break;
        }
        case "variant": {
          if (n.type !== "INSTANCE") throw Error(`${label(n)} \u4E0D\u662F\u7EC4\u4EF6\u5B9E\u4F8B\u3002`);
          const target = await namedVariant(n, intent.value);
          if (!target) throw Error(`${label(n)} \u627E\u4E0D\u5230\u5339\u914D\u7684 ${intent.value} \u53D8\u4F53\u3002`);
          rows.push(`${label(n)}\uFF1A\u5207\u6362\u5230 ${target.name}`);
          break;
        }
        case "rename":
          rows.push(`${label(n)} \u2192 ${intent.pattern.replaceAll("{n}", String(i + 1))}`);
          break;
        case "smaller": {
          const d = await smallerDecision(n);
          rows.push(`${d.preview} \xB7 \u6765\u6E90\uFF1A${d.source}`);
          break;
        }
      }
    }
    return rows;
  }
  async function namedVariant(n, value2) {
    const main = await n.getMainComponentAsync();
    if (!main || main.parent?.type !== "COMPONENT_SET") return null;
    const props = n.variantProperties || {};
    const aliases2 = { \u5C0F\u53F7: "small", \u4E2D\u53F7: "medium", \u5927\u53F7: "large", \u6B21\u8981: "secondary", \u4E3B\u8981: "primary" };
    const wanted = (aliases2[value2.toLowerCase()] || value2).toLowerCase();
    return main.parent.children.find((c) => c.type === "COMPONENT" && Object.entries(c.variantProperties || {}).some(([k, v]) => v.toLowerCase() === wanted && Object.entries(props).every(([other, old]) => other === k || c.variantProperties?.[other] === old))) || null;
  }
  function similarName(name) {
    return name.toLowerCase().replace(/\b(?:small|medium|large|sm|md|lg)\b|小号|中号|大号|[0-9]+/g, "").replace(/[\s_\-]+/g, "").trim();
  }
  function filePadding(n) {
    if (n.layoutSizingVertical !== "HUG" || !n.parent || !("children" in n.parent)) return null;
    const peers = n.parent.children.filter((p) => p !== n && p.type === n.type && "layoutMode" in p && p.layoutMode === n.layoutMode && similarName(p.name) === similarName(n.name));
    const shorter = peers.filter((p) => p.height < n.height && p.height >= n.height * 0.75 && p.paddingTop <= n.paddingTop && p.paddingBottom <= n.paddingBottom).sort((a, b) => b.height - a.height)[0];
    if (!shorter) return null;
    return { value: Math.max(0, n.paddingTop - (n.height - shorter.height) / 2), example: shorter.name };
  }
  async function smallerDecision(n) {
    if (n.type === "INSTANCE") {
      const target = await smallVariant(n);
      if (target) {
        const main = await n.getMainComponentAsync();
        return { mode: "variant", target, source: "\u7EC4\u4EF6\u5C3A\u5BF8\u53D8\u4F53", preview: `${label(n)}\uFF1A${main?.name || "\u5F53\u524D\u53D8\u4F53"} \u2192 ${target.name}` };
      }
    }
    if (isAuto(n) && n.type !== "INSTANCE") {
      const fromFile = filePadding(n);
      if (fromFile) return { mode: "padding", value: fromFile.value, source: `\u53C2\u8003\u5F53\u524D\u6587\u4EF6\uFF1A${fromFile.example}`, preview: `${label(n)}\uFF1A\u4E0A/\u4E0B\u5185\u8FB9\u8DDD ${n.paddingTop}/${n.paddingBottom} \u2192 ${fromFile.value}/${Math.max(0, n.paddingBottom - (n.paddingTop - fromFile.value))} px` };
      if (n.paddingTop === 0 && n.paddingRight === 0 && n.paddingBottom === 0 && n.paddingLeft === 0) throw Error(`${label(n)} \u5DF2\u65E0\u5185\u8FB9\u8DDD\u53EF\u7F29\u5C0F\uFF1B\u8BF7\u6307\u5B9A\u5BBD\u5EA6/\u9AD8\u5EA6\u6216\u9009\u62E9\u8F83\u5C0F\u53D8\u4F53\u3002`);
      return { mode: "padding", value: Math.max(0, n.paddingTop - 2), source: "\u63D2\u4EF6\u5EFA\u8BAE\u503C", preview: `${label(n)}\uFF1A\u56DB\u8FB9\u5185\u8FB9\u8DDD\u5404\u51CF\u5C11 2 px\uFF08\u4E0B\u9650 0\uFF09` };
    }
    if (isSized(n) && n.type !== "TEXT") return { mode: "resize", source: "\u63D2\u4EF6\u5EFA\u8BAE\u503C", preview: `${label(n)}\uFF1A${Math.round(n.width)}\xD7${Math.round(n.height)} \u2192 ${Math.max(1, Math.round(n.width * 0.9))}\xD7${Math.max(1, Math.round(n.height * 0.9))} px` };
    throw Error(`${label(n)} \u65E0\u6CD5\u5B89\u5168\u5224\u65AD\u7F29\u5C0F\u65B9\u5F0F\uFF1B\u53EF\u6307\u5B9A\u5BBD\u9AD8\uFF0C\u6216\u9009\u62E9\u8F83\u5C0F\u7EC4\u4EF6\u53D8\u4F53\u3002`);
  }
  function measure(n, intent) {
    if (intent.kind === "direction" && "layoutMode" in n) return n.layoutMode;
    if (intent.kind === "distribute") return `x=${Math.round(n.x)}, y=${Math.round(n.y)}`;
    if (intent.kind === "gap" && "itemSpacing" in n) return `${n.itemSpacing} px`;
    if (intent.kind === "padding" && "paddingTop" in n) return `${n.paddingTop}/${n.paddingRight}/${n.paddingBottom}/${n.paddingLeft} px`;
    if (intent.kind === "align" && !isAuto(n)) return `x=${Math.round(n.x)}, y=${Math.round(n.y)}`;
    if (intent.kind === "align" && isAuto(n)) {
      const isCross = n.layoutMode === "HORIZONTAL" && intent.axis === "vertical" || n.layoutMode === "VERTICAL" && intent.axis === "horizontal";
      return isCross ? n.counterAxisAlignItems : n.primaryAxisAlignItems;
    }
    if (intent.kind === "sizing" && "layoutSizingHorizontal" in n) return intent.axis === "horizontal" ? n.layoutSizingHorizontal : n.layoutSizingVertical;
    if (intent.kind === "rename") return n.name;
    if (intent.kind === "style") {
      if (n.type === "TEXT") return `\u6587\u5B57\u6837\u5F0F ${String(n.textStyleId)}`;
      if ("fillStyleId" in n) return `\u586B\u5145\u6837\u5F0F ${String(n.fillStyleId)}`;
    }
    if (intent.kind === "variable") {
      if ("boundVariables" in n) {
        const v = n.boundVariables;
        if (v?.itemSpacing) return `\u95F4\u8DDD\u53D8\u91CF ${v.itemSpacing.id}`;
      }
      if ("fills" in n && n.fills !== figma.mixed) {
        const paint2 = n.fills.find((p) => p.type === "SOLID");
        const id = paint2?.boundVariables?.color?.id;
        if (id) return `\u989C\u8272\u53D8\u91CF ${id}`;
      }
      return "\u672A\u7ED1\u5B9A";
    }
    if (intent.kind === "variant" && n.type === "INSTANCE") return JSON.stringify(n.variantProperties);
    return `${Math.round(n.width)}\xD7${Math.round(n.height)} px`;
  }
  async function smallVariant(n) {
    const main = await n.getMainComponentAsync();
    if (!main || main.parent?.type !== "COMPONENT_SET") return null;
    const props = n.variantProperties || {};
    const sizeKey = Object.keys(props).find((k) => /^(size|尺寸)$/i.test(k));
    if (!sizeKey || /^(small|sm)$/i.test(props[sizeKey] || "")) return null;
    return main.parent.children.find((c) => c.type === "COMPONENT" && c.variantProperties?.[sizeKey]?.toLowerCase() === "small" && Object.entries(props).every(([k, v]) => k === sizeKey || c.variantProperties?.[k] === v)) || null;
  }
  async function apply(intent, nodes) {
    if (intent.kind === "align" && nodes.length > 1) {
      const axis = intent.axis === "horizontal" ? "x" : "y", size = intent.axis === "horizontal" ? "width" : "height";
      const start = Math.min(...nodes.map((n) => n[axis]));
      const end = Math.max(...nodes.map((n) => n[axis] + n[size]));
      const center = (start + end) / 2;
      for (const n of nodes) n[axis] = intent.value === "MIN" ? start : intent.value === "MAX" ? end - n[size] : center - n[size] / 2;
      return;
    }
    if (intent.kind === "distribute") {
      const axis = intent.value === "horizontal" ? "x" : "y", size = intent.value === "horizontal" ? "width" : "height";
      const ordered = [...nodes].sort((a, b) => a[axis] - b[axis]);
      const first = ordered[0], last = ordered[ordered.length - 1];
      const total = last[axis] + last[size] - first[axis];
      const widths = ordered.reduce((s, n) => s + n[size], 0);
      const gap = (total - widths) / (ordered.length - 1);
      if (gap < 0) throw Error("\u56FE\u5C42\u91CD\u53E0\u8FC7\u591A\uFF0C\u65E0\u6CD5\u4FDD\u6301\u9996\u5C3E\u4F4D\u7F6E\u5E76\u7B49\u8DDD\u5206\u5E03\u3002");
      let pos = first[axis];
      for (const n of ordered) {
        n[axis] = pos;
        pos += n[size] + gap;
      }
      return;
    }
    const styles = intent.kind === "style" ? await Promise.all([figma.getLocalTextStylesAsync(), figma.getLocalPaintStylesAsync()]) : null;
    const variable = intent.kind === "variable" ? (await figma.variables.getLocalVariablesAsync()).find((v) => v.name.toLowerCase() === intent.name.toLowerCase()) : null;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      switch (intent.kind) {
        case "direction":
          n.layoutMode = intent.value;
          break;
        case "gap":
          n.itemSpacing = intent.value;
          break;
        case "padding": {
          const a = n;
          a.paddingTop = a.paddingRight = a.paddingBottom = a.paddingLeft = intent.value;
          break;
        }
        case "width": {
          const a = n;
          if ("layoutSizingHorizontal" in a && a.layoutSizingHorizontal !== "FIXED") a.layoutSizingHorizontal = "FIXED";
          a.resize(intent.value, a.height);
          break;
        }
        case "height": {
          const a = n;
          if ("layoutSizingVertical" in a && a.layoutSizingVertical !== "FIXED") a.layoutSizingVertical = "FIXED";
          a.resize(a.width, intent.value);
          break;
        }
        case "align": {
          const a = n;
          const isCross = a.layoutMode === "HORIZONTAL" && intent.axis === "vertical" || a.layoutMode === "VERTICAL" && intent.axis === "horizontal";
          if (isCross) a.counterAxisAlignItems = intent.value;
          else a.primaryAxisAlignItems = intent.value;
          break;
        }
        case "style": {
          const s = [...styles[0], ...styles[1]].find((x) => x.name.toLowerCase() === intent.name.toLowerCase());
          if (s.type === "TEXT") await n.setTextStyleIdAsync(s.id);
          else await n.setFillStyleIdAsync(s.id);
          break;
        }
        case "variable": {
          if (variable.resolvedType === "FLOAT") n.setBoundVariable("itemSpacing", variable);
          else {
            const a = n;
            const fills = a.fills;
            if (fills === figma.mixed) throw Error("\u6DF7\u5408\u586B\u5145\u65E0\u6CD5\u7ED1\u5B9A\u989C\u8272\u53D8\u91CF\u3002");
            const index = fills.findIndex((p) => p.type === "SOLID");
            if (index < 0) throw Error("\u76EE\u6807\u6CA1\u6709\u53EF\u7ED1\u5B9A\u7684\u7EAF\u8272\u586B\u5145\u3002");
            const copy2 = [...fills];
            copy2[index] = figma.variables.setBoundVariableForPaint(copy2[index], "color", variable);
            a.fills = copy2;
          }
          break;
        }
        case "sizing": {
          const a = n;
          if (intent.axis === "horizontal") a.layoutSizingHorizontal = intent.value;
          else a.layoutSizingVertical = intent.value;
          break;
        }
        case "variant":
          n.swapComponent(await namedVariant(n, intent.value));
          break;
        case "rename":
          n.name = intent.pattern.replaceAll("{n}", String(i + 1));
          break;
        case "smaller": {
          const d = await smallerDecision(n);
          if (d.mode === "variant") n.swapComponent(d.target);
          else if (d.mode === "padding") {
            const a = n;
            if (d.source.startsWith("\u53C2\u8003\u5F53\u524D\u6587\u4EF6")) {
              const delta = a.paddingTop - d.value;
              a.paddingTop = d.value;
              a.paddingBottom = Math.max(0, a.paddingBottom - delta);
            } else {
              a.paddingTop = Math.max(0, a.paddingTop - 2);
              a.paddingRight = Math.max(0, a.paddingRight - 2);
              a.paddingBottom = Math.max(0, a.paddingBottom - 2);
              a.paddingLeft = Math.max(0, a.paddingLeft - 2);
            }
          } else {
            const a = n;
            a.resize(Math.max(1, Math.round(a.width * 0.9)), Math.max(1, Math.round(a.height * 0.9)));
          }
          break;
        }
      }
    }
  }
  figma.ui.onmessage = async (msg) => {
    try {
      if (msg.type === "resizeUI") {
        if (Number.isInteger(msg.height) && msg.height >= 220 && msg.height <= 640) figma.ui.resize(400, msg.height);
        return;
      }
      if (msg.type === "refresh") {
        context();
        return;
      }
      if (msg.type === "jevReply") {
        const pending2 = jevPending.get(msg.id);
        if (!pending2) return;
        jevPending.delete(msg.id);
        clearTimeout(pending2.timer);
        if (msg.networkError) pending2.reject(Error("\u63D2\u4EF6\u65E0\u6CD5\u8BBF\u95EE\u672C\u673A Jev \u670D\u52A1\u3002\u8BF7\u786E\u8BA4 npm run jev \u6B63\u5728\u8FD0\u884C\uFF0C\u7136\u540E\u91CD\u65B0\u8FDE\u63A5\u3002"));
        else pending2.resolve({ ok: msg.ok === true, status: msg.status, payload: msg.payload });
        return;
      }
      if (msg.type === "undo") {
        const kind = undoOrder.pop();
        if (!kind) throw Error("\u5F53\u524D\u6CA1\u6709\u53EF\u64A4\u9500\u7684\u63D2\u4EF6\u64CD\u4F5C\u3002");
        const message = kind === "live" ? undoLive() : kind === "workflow" && hasWorkflowUndo() ? undoWorkflow() : (figma.triggerUndo(), "\u5DF2\u64A4\u9500\u6700\u8FD1\u4E00\u6B21\u63D2\u4EF6\u64CD\u4F5C\u3002");
        canUndo = undoOrder.length > 0;
        pending = null;
        send("done", { message, canUndo });
        context();
        return;
      }
      if (msg.type === "auto") {
        if (typeof msg.stepId === "number") {
          if (processedVoiceSteps.has(msg.stepId)) throw Error("\u91CD\u590D\u8BED\u97F3\u7247\u6BB5\u5DF2\u5FFD\u7565\u3002");
          processedVoiceSteps.add(msg.stepId);
        }
        const text = String(msg.text || "");
        const interpreted = await interpret(text, await conversationContext(), requestJev);
        const reversesPrevious = interpreted.command.kind === "undo" || interpreted.command.kind === "modify" && interpreted.command.mode === "restore";
        if (reversesPrevious) {
          if (undoOrder[undoOrder.length - 1] !== "live") throw Error("\u4E0A\u4E00\u53E5\u4E0D\u662F\u53EF\u64A4\u56DE\u7684\u8BED\u97F3\u7F16\u8F91\u3002");
        }
        const detail = await executeLive(interpreted.command);
        if (reversesPrevious) undoOrder.pop();
        else undoOrder.push("live");
        pending = null;
        send("done", { message: `Jev \u5224\u65AD\uFF08\u7F6E\u4FE1\u5EA6 ${Math.round(interpreted.confidence * 100)}%\uFF09\u5DF2\u6267\u884C\uFF1A${detail}`, canUndo: undoOrder.length > 0, stepId: msg.stepId });
        context();
        return;
      }
      if (msg.type === "preview") {
        const result = parse(String(msg.text || ""));
        if (!result.intent) throw Error(result.error);
        if (isWorkflow(result.intent)) {
          const workflow = await previewWorkflow(result.intent, typeof msg.candidateId === "string" ? msg.candidateId : void 0);
          pending = workflow.choices ? null : { intent: result.intent, ids: [], rows: workflow.rows, key: String(msg.text), workflow };
          send("plan", { rows: workflow.rows, command: String(msg.text), count: workflow.rows.length, choices: workflow.choices });
          return;
        }
        const nodes = selected();
        const rows = await plan(result.intent, nodes);
        const source = result.intent.kind === "gap" || result.intent.kind === "padding" || result.intent.kind === "width" || result.intent.kind === "height" ? "\u7528\u6237\u6307\u5B9A" : result.intent.kind === "style" || result.intent.kind === "variable" ? "\u5F53\u524D\u6587\u4EF6\u8BBE\u8BA1\u8D44\u6E90" : result.intent.kind === "smaller" ? "" : result.intent.kind === "variant" ? "\u7EC4\u4EF6\u53D8\u4F53" : "\u6307\u4EE4";
        pending = { intent: result.intent, ids: nodes.map((n) => n.id), rows: source ? rows.map((r) => `${r} \xB7 \u6765\u6E90\uFF1A${source}`) : rows, key: String(msg.text) };
        send("plan", { rows: pending.rows, command: String(msg.text), count: nodes.length });
        return;
      }
      if (msg.type === "apply") {
        if (!pending) throw Error("\u8BF7\u5148\u9884\u89C8\u6307\u4EE4\u3002");
        if (pending.workflow) {
          const detail = await applyWorkflow(pending.workflow);
          undoOrder.push("workflow");
          pending = null;
          send("done", { message: `\u5DF2\u6267\u884C\uFF1A${detail}`, canUndo: true });
          context();
          return;
        }
        if (pending.ids.join("|") !== selected().map((n) => n.id).join("|")) throw Error("\u9009\u533A\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
        const nodes = selected();
        await plan(pending.intent, nodes);
        const before = nodes.map((n) => measure(n, pending.intent));
        const details = pending.rows;
        await apply(pending.intent, nodes);
        figma.commitUndo();
        canUndo = true;
        undoOrder.push("regular");
        const actual = nodes.map((n, i) => `${n.name}\uFF1A${before[i]} \u2192 ${measure(n, pending.intent)}`);
        send("done", { message: `\u5DF2\u4FEE\u6539 ${nodes.length} \u4E2A\u56FE\u5C42\u3002\u5B9E\u9645\u503C\uFF1A${actual.join("\uFF1B")}\u3002\u9884\u89C8\u4F9D\u636E\uFF1A${details.join("\uFF1B")}`, canUndo: true });
        pending = null;
        context();
        return;
      }
    } catch (e) {
      send("error", { message: e instanceof Error ? e.message : String(e), stepId: msg.stepId });
    }
  };
})();
