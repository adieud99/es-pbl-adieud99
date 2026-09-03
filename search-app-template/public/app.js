const elements = {
  title: document.querySelector("#app-title"),
  description: document.querySelector("#app-description"),
  input: document.querySelector("#search-input"),
  form: document.querySelector("#search-form"),
  examples: document.querySelector("#example-queries"),
  summary: document.querySelector("#result-summary"),
  took: document.querySelector("#took"),
  message: document.querySelector("#message"),
  list: document.querySelector("#result-list"),
  section: document.querySelector(".results-section"),
  connection: document.querySelector("#connection-state"),
  queryTools: document.querySelector("#query-tools"),
  queryToggle: document.querySelector("#query-toggle"),
  queryPanel: document.querySelector("#query-panel"),
  queryPath: document.querySelector("#query-path"),
  queryCode: document.querySelector("#query-code")
};

let config;

function closeQueryPanel() {
  elements.queryPanel.hidden = true;
  elements.queryToggle.setAttribute("aria-expanded", "false");
  elements.queryToggle.textContent = "검색 쿼리 보기";
}

function setExecutedQuery(request) {
  if (!request?.body) {
    elements.queryTools.hidden = true;
    closeQueryPanel();
    return;
  }
  elements.queryPath.textContent = `${request.method || "POST"} ${request.path || ""}`;
  elements.queryCode.textContent = JSON.stringify(request.body, null, 2);
  elements.queryTools.hidden = false;
  closeQueryPanel();
}

function getValue(source, fieldPath) {
  return String(fieldPath || "").split(".").reduce((value, key) => value?.[key], source);
}

function textValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "예";
  if (value === false) return "아니요";
  return value ?? "-";
}

function formattedValue(value, item) {
  const base = item.format === "number" && Number.isFinite(Number(value))
    ? new Intl.NumberFormat("ko-KR").format(Number(value))
    : textValue(value);
  return `${base}${item.suffix || ""}`;
}

function safeHighlightedValue(hit, fieldPath, fallback) {
  const highlighted = hit.highlight?.[fieldPath]?.[0];
  if (!highlighted) return escapeHtml(textValue(fallback));
  return escapeHtml(highlighted).replaceAll("&lt;mark&gt;", "<mark>").replaceAll("&lt;/mark&gt;", "</mark>");
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = String(value);
  return node.innerHTML;
}

function renderHits(hits) {
  elements.list.replaceChildren();
  for (const hit of hits) {
    const source = hit._source || {};
    const fields = config.resultFields;
    const article = document.createElement("article");
    article.className = "result-card";
    const meta = (fields.meta || []).map((item) => `
      <div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(formattedValue(getValue(source, item.field), item))}</dd></div>
    `).join("");
    const badgeValue = fields.badge ? getValue(source, fields.badge) : null;
    article.innerHTML = `
      <div class="card-top">
        <h3>${safeHighlightedValue(hit, fields.title, getValue(source, fields.title))}</h3>
        ${badgeValue == null ? "" : `<span class="badge">${escapeHtml(textValue(badgeValue))}</span>`}
      </div>
      ${fields.description ? `<p class="description">${safeHighlightedValue(hit, fields.description, getValue(source, fields.description))}</p>` : ""}
      ${meta ? `<dl class="meta">${meta}</dl>` : ""}
    `;
    elements.list.append(article);
  }
}

function showMessage(title, detail, type = "initial") {
  elements.message.className = `message ${type}`;
  elements.message.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
  elements.message.hidden = false;
  elements.list.replaceChildren();
}

async function search(searchText) {
  elements.section.setAttribute("aria-busy", "true");
  elements.summary.textContent = `“${searchText}” 검색 중`;
  elements.took.textContent = "";
  elements.queryTools.hidden = true;
  closeQueryPanel();
  showMessage("검색 중", "ES에서 결과를 가져오고 있습니다.");
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(searchText)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "검색 요청에 실패했습니다.");
    const hits = data.hits?.hits || [];
    const total = typeof data.hits?.total === "number" ? data.hits.total : (data.hits?.total?.value || 0);
    elements.summary.textContent = `“${searchText}” 검색 결과 ${new Intl.NumberFormat("ko-KR").format(total)}건`;
    elements.took.textContent = `${data.took ?? 0}ms`;
    setExecutedQuery(data.pblRequest);
    if (!hits.length) showMessage("검색 결과가 없습니다", "검색어와 query field, 실제 저장값을 확인하세요.");
    else { elements.message.hidden = true; renderHits(hits); }
  } catch (error) {
    elements.summary.textContent = "검색 요청을 확인하세요";
    showMessage("검색하지 못했습니다", error.message, "error");
  } finally {
    elements.section.setAttribute("aria-busy", "false");
  }
}

async function initialize() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "설정을 읽지 못했습니다.");
    config = data;
    document.title = config.appTitle;
    elements.title.textContent = config.appTitle;
    elements.description.textContent = config.appDescription || "내가 설계한 검색 기능을 확인합니다.";
    elements.input.placeholder = config.searchPlaceholder || "검색어를 입력하세요";
    elements.connection.textContent = `${config.index} 연결 준비`;
    elements.connection.className = "connection ok";
    for (const query of config.exampleQueries || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = query;
      button.addEventListener("click", () => { elements.input.value = query; search(query); });
      elements.examples.append(button);
    }
  } catch (error) {
    elements.connection.textContent = "설정 오류";
    elements.connection.className = "connection error";
    showMessage("앱 설정을 확인하세요", error.message, "error");
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const searchText = elements.input.value.trim();
  if (searchText) search(searchText);
});

elements.queryToggle.addEventListener("click", () => {
  const willOpen = elements.queryPanel.hidden;
  elements.queryPanel.hidden = !willOpen;
  elements.queryToggle.setAttribute("aria-expanded", String(willOpen));
  elements.queryToggle.textContent = willOpen ? "검색 쿼리 닫기" : "검색 쿼리 보기";
});

initialize();
