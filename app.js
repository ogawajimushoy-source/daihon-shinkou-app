(function () {
  var D = window.Daihon;
  var STORAGE_KEY = "daihon-app-v1";
  var MAX_EDGE = 1600;
  var MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
  var serverMode = typeof google !== "undefined" && google.script && google.script.run;

  var state = { clients: [], videos: [], templates: D.emptyTemplates() };
  var imageCache = {};
  var ui = { newClientName: "", creatingFor: "", newTitle: "", newKind: "interview", renameId: "", renameValue: "", rundownDraft: "", spokenDraft: "", modal: null, status: "", renaming: null, commentFor: "" };
  var paneWidths = { list: 220, notes: 260 };
  try {
    var savedPanes = JSON.parse(localStorage.getItem("daihon-pane-widths") || "");
    if (savedPanes && savedPanes.list) paneWidths.list = Math.min(480, Math.max(160, Number(savedPanes.list) || 220));
    if (savedPanes && savedPanes.notes) paneWidths.notes = Math.min(520, Math.max(180, Number(savedPanes.notes) || 260));
  } catch (err) { /* 幅の記録が壊れていても、初期幅で開く */ }
  var FIELD_ICONS = { people: "person", page: "link", totalDuration: "clock", referenceVideo: "link", cameraCount: "clock" };
  var saveChains = {};
  var FIELD_HINTS = {
    people: "例）社員、社長、プロジェクトメンバー など",
    page: "例）採用ページ、サービス紹介ページ など",
    totalDuration: "例）1分〜2分、3分以内 など",
    impression: "例）採用に興味のある方に、会社の魅力を伝えたいです。",
    avoid: "例）年収の具体額、競合の批判 など",
    persona: "例）未経験から手に職をつけたい人 など",
    mustSay: "例）チームで現場を回していること など",
    mustNotRaw: "例）残業の具体時間 など",
    atmosphere: "例）親しみやすさ。インサートで現場感を出す など",
    telop: "例）質問テロップなし。切り替えでセリフを帯に出す",
    referenceVideo: "例）参考にしたい動画のタイトルやURL",
    arollPlace: "例）会社前。空や緑も入る画 など",
    cameraCount: "例）2台",
    requiredInserts: "例）指示している様子、作業風景 など",
  };

  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value == null || value === false) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "value") node.value = value;
      else if (key === "selected") node.selected = value === true || value === "selected";
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    appendKids(node, kids);
    return node;
  }

  function appendKids(node, kids) {
    [].concat(kids || []).forEach(function (kid) {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) appendKids(node, kid);
      else node.append(typeof kid === "string" ? document.createTextNode(kid) : kid);
    });
  }

  function gas(name, arg) {
    return new Promise(function (resolve, reject) {
      var runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(function (err) {
        reject(err instanceof Error ? err : new Error(err && err.message ? err.message : "保存に失敗しました"));
      });
      if (arg === undefined) runner[name]();
      else runner[name](arg);
    });
  }

  function loadBag() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeBag(bag) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bag));
    } catch (e) {
      throw new Error("このブラウザの保存容量を超えました。画像を減らすか、公開したURLで使ってください。");
    }
  }

  var localBackend = {
    load: function () {
      var bag = loadBag();
      return Promise.resolve({
        clients: bag.clients || [],
        videos: (bag.videos || []).map(D.normalizeVideo),
        templates: Object.assign(D.emptyTemplates(), bag.templates || {}),
      });
    },
    saveClient: function (client) {
      var bag = loadBag();
      bag.clients = bag.clients || [];
      var index = bag.clients.findIndex(function (item) { return item.id === client.id; });
      if (index >= 0) bag.clients[index] = client;
      else bag.clients.push(client);
      writeBag(bag);
      return Promise.resolve();
    },
    deleteClient: function (id) {
      var bag = loadBag();
      bag.images = bag.images || {};
      (bag.videos || []).filter(function (video) { return video.clientId === id; }).forEach(function (video) {
        imageIds(video).forEach(function (imageId) { delete bag.images[imageId]; });
      });
      bag.clients = (bag.clients || []).filter(function (client) { return client.id !== id; });
      bag.videos = (bag.videos || []).filter(function (video) { return video.clientId !== id; });
      writeBag(bag);
      return Promise.resolve();
    },
    saveVideo: function (video) {
      var bag = loadBag();
      bag.videos = bag.videos || [];
      var index = bag.videos.findIndex(function (item) { return item.id === video.id; });
      if (index >= 0) bag.videos[index] = video;
      else bag.videos.push(video);
      writeBag(bag);
      return Promise.resolve();
    },
    deleteVideo: function (id) {
      var bag = loadBag();
      bag.images = bag.images || {};
      var video = (bag.videos || []).find(function (item) { return item.id === id; });
      if (video) imageIds(video).forEach(function (imageId) { delete bag.images[imageId]; });
      bag.videos = (bag.videos || []).filter(function (item) { return item.id !== id; });
      writeBag(bag);
      return Promise.resolve();
    },
    saveTemplates: function (templates) {
      var bag = loadBag();
      bag.templates = templates;
      writeBag(bag);
      return Promise.resolve();
    },
    uploadImage: function (dataUrl) {
      var bag = loadBag();
      bag.images = bag.images || {};
      var id = crypto.randomUUID();
      bag.images[id] = dataUrl;
      writeBag(bag);
      return Promise.resolve({ id: id });
    },
    deleteImage: function (id) {
      var bag = loadBag();
      if (bag.images) delete bag.images[id];
      writeBag(bag);
      delete imageCache[id];
      return Promise.resolve();
    },
    getImages: function (ids) {
      var bag = loadBag();
      var out = {};
      ids.forEach(function (id) { out[id] = (bag.images && bag.images[id]) || ""; });
      return Promise.resolve(out);
    },
  };

  var gasBackend = {
    load: function () { return gas("getState"); },
    saveClient: function (client) { return gas("saveClient", client); },
    deleteClient: function (id) { return gas("deleteClient", id); },
    saveVideo: function (video) { return gas("saveVideo", video); },
    deleteVideo: function (id) { return gas("deleteVideo", id); },
    saveTemplates: function (templates) { return gas("saveTemplates", templates); },
    uploadImage: function (dataUrl) {
      var parts = String(dataUrl).split(",");
      return gas("uploadImage", { base64: parts[1] || "", mime: "image/jpeg" });
    },
    deleteImage: function (id) { return gas("deleteImage", id); },
    getImages: function (ids) { return gas("getImages", ids); },
  };

  var backend = serverMode ? gasBackend : localBackend;

  function imageIds(video) {
    var ids = (video.aroll || []).map(function (image) { return image.id; });
    (video.questions || []).forEach(function (q) {
      (q.images || []).forEach(function (image) { ids.push(image.id); });
    });
    return ids;
  }

  function route() {
    var hash = location.hash || "#/";
    if (hash === "#/templates") return { name: "templates" };
    var review = hash.match(/^#\/r\/([^/]+)$/);
    if (review) return { name: "review", key: decodeURIComponent(review[1]) };
    var preview = hash.match(/^#\/v\/([^/]+)\/preview$/);
    if (preview) return { name: "preview", id: decodeURIComponent(preview[1]) };
    var matched = hash.match(/^#\/v\/([^/]+)$/);
    if (matched) return { name: "video", id: decodeURIComponent(matched[1]) };
    return { name: "list" };
  }

  function videoById(id) {
    return state.videos.find(function (video) { return video.id === id; }) || null;
  }

  function currentVideo() {
    var here = route();
    if (here.name === "review") return state.videos.find(function (video) { return video.reviewKey === here.key; }) || null;
    return here.name === "video" || here.name === "preview" ? videoById(here.id) : null;
  }

  function setStatus(text) {
    ui.status = text;
    var node = document.getElementById("status");
    if (node) node.textContent = text;
  }

  function replaceVideo(video) {
    var index = state.videos.findIndex(function (item) { return item.id === video.id; });
    if (index >= 0) state.videos[index] = video;
    else state.videos.push(video);
  }

  function enqueue(key, job) {
    saveChains[key] = (saveChains[key] || Promise.resolve()).then(job, job);
    return saveChains[key].then(function () {
      setStatus("保存しました");
    }, function (err) {
      setStatus(err && err.message ? err.message : "保存に失敗しました");
    });
  }

  function saveVideoNow(id) {
    return enqueue("video:" + id, function () {
      var video = videoById(id);
      if (!video) return;
      video.updatedAt = new Date().toISOString();
      setStatus("保存しています");
      return backend.saveVideo(JSON.parse(JSON.stringify(video)));
    });
  }

  function touchVideo(id) {
    clearTimeout(saveChains["timer:" + id]);
    saveChains["timer:" + id] = setTimeout(function () { saveVideoNow(id); }, 400);
  }

  function shell(view) {
    var reviewing = route().name === "review";
    return [
      h("div", { class: "banner no-print" }, reviewing
        ? ["原文は変更できません。たたき台の修正とコメントができます。"]
        : [
          h("strong", { text: "このURLを知っている人は編集できます。" }),
          " クライアントとのチャットには、このURLを貼らないでください。",
        ]),
      h("header", { class: "topbar no-print" }, [
        reviewing
          ? h("span", { class: "brand" }, [
            h("span", { class: "kicker", text: "採用動画" }),
            h("span", { class: "brand-name", text: "台本進行" }),
          ])
          : h("a", { class: "brand", href: "#/" }, [
            h("span", { class: "kicker", text: "採用動画" }),
            h("span", { class: "brand-name", text: "台本進行" }),
          ]),
        h("nav", {}, reviewing ? [] : [
          h("a", { href: "#/", text: "一覧" }),
          h("a", { href: "#/templates", text: "定型" }),
          route().name === "video"
            ? h("button", { type: "button", class: "nav-review", "data-action": "request-review", text: "確認を依頼" })
            : null,
          route().name === "video"
            ? h("a", { class: "nav-preview", href: "#/v/" + encodeURIComponent(route().id) + "/preview", text: "プレビュー" })
            : null,
          route().name === "preview"
            ? h("a", { class: "nav-preview", href: "#/v/" + encodeURIComponent(route().id), text: "編集に戻る" })
            : null,
        ]),
      ]),
      h("main", { class: "wrap" }, [view, h("p", { id: "status", class: "status", text: ui.status })]),
      h("p", { class: "footer no-print wrap" }, serverMode
        ? "会社のGoogleアカウントのスプレッドシートに保存しています。"
        : "台本はこのブラウザの中に保存されます。パソコンを切っても、同じブラウザでこのURLを開けば残っています。別のパソコンには移りません。"),
    ];
  }

  function render() {
    var root = document.getElementById("app");
    try {
      renderView(root);
    } catch (err) {
      document.body.classList.remove("is-video");
      document.body.classList.remove("is-preview");
      document.body.classList.remove("is-review");
      root.replaceChildren(
        h("p", { class: "hint", text: "この台本を開けませんでした。" }),
        h("p", {}, [h("a", { href: "#/", text: "一覧へ戻る" })])
      );
    }
  }

  function renderView(root) {
    var here = route();
    var view = here.name === "templates" ? viewTemplates() : here.name === "preview" ? viewPreview(here.id) : here.name === "review" ? viewReview(here.key) : here.name === "video" ? viewVideo(here.id) : viewList();
    var nodes = shell(view);
    var modal = modalNode();
    if (modal) nodes.push(modal);
    root.replaceChildren.apply(root, nodes);
    var dialog = root.querySelector("dialog");
    if (dialog && !dialog.open) {
      dialog.addEventListener("cancel", function (event) {
        event.preventDefault();
        ui.modal = null;
        render();
      });
      dialog.showModal();
    }
    hydrateImages(root);
    document.body.classList.toggle("is-video", here.name === "video");
    document.body.classList.toggle("is-preview", here.name === "preview");
    document.body.classList.toggle("is-review", here.name === "review");
    var nameEdit = root.querySelector(".name-edit");
    if (nameEdit && ui.renaming && ui.renaming.focus) {
      ui.renaming.focus = false;
      nameEdit.focus();
      nameEdit.select();
    }
    document.title = "台本進行";
  }

  function viewList() {
    var clients = state.clients.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    var blocks = clients.map(function (client) {
      var videos = state.videos.filter(function (video) { return video.clientId === client.id; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
      var active = videos.filter(function (video) { return video.stage !== "done"; });
      var done = videos.filter(function (video) { return video.stage === "done"; });
      return h("section", { class: "client" }, [
        h("div", { class: "row-actions" }, [
          ui.renameId === client.id
            ? h("input", { type: "text", value: ui.renameValue, "data-ui": "renameValue", "aria-label": "クライアント名" })
            : h("h2", { text: client.name, style: "margin:0;font-size:18px" }),
          ui.renameId === client.id
            ? h("button", { type: "button", class: "btn btn-primary", "data-action": "save-client-name", "data-id": client.id, text: "保存" })
            : h("button", { type: "button", class: "btn", "data-action": "rename-client", "data-id": client.id, text: "名前を変える" }),
          h("button", { type: "button", class: "sheet-x", "data-action": "delete-client", "data-id": client.id, text: "×", "aria-label": "クライアントを削除" }),
        ]),
        active.length ? null : h("p", { class: "empty", text: "進行中の台本はありません。" }),
        active.map(videoRow),
        done.length ? h("details", { class: "done-fold" }, [
          h("summary", { text: "完了 " + done.length + "本" }),
          done.map(videoRow),
        ]) : null,
        ui.creatingFor === client.id ? h("div", { class: "create-row", style: "margin-top:10px" }, [
          h("input", { type: "text", value: ui.newTitle, "data-ui": "newTitle", placeholder: "仮タイトル", "aria-label": "仮タイトル" }),
          h("select", { "data-ui": "newKind", "aria-label": "種別" }, [
            h("option", { value: "interview", text: "インタビュー", selected: ui.newKind !== "dialogue" ? "selected" : null }),
            h("option", { value: "dialogue", text: "対談", selected: ui.newKind === "dialogue" ? "selected" : null }),
          ]),
          h("button", { type: "button", class: "btn btn-primary", "data-action": "create-video", "data-id": client.id, text: "この台本を作る" }),
        ]) : h("button", { type: "button", class: "btn", "data-action": "start-video", "data-id": client.id, text: "台本を追加" }),
      ]);
    });
    return h("div", {}, [
      h("div", { class: "create-row card", style: "padding:16px" }, [
        h("input", { type: "text", value: ui.newClientName, "data-ui": "newClientName", placeholder: "クライアント名", "aria-label": "クライアント名" }),
        h("button", { type: "button", class: "btn btn-primary", "data-action": "create-client", text: "クライアントを追加" }),
      ]),
      blocks.length ? blocks : h("p", { class: "empty", text: "クライアントを追加すると、その中に台本を作れます。" }),
      h("div", { class: "row-actions no-print", style: "margin-top:18px" }, [
        h("button", { type: "button", class: "btn", "data-action": "export-bag", text: "保存を書き出す" }),
        h("label", { class: "btn" }, [
          "保存を読み込む",
          h("input", { class: "file-input", type: "file", accept: "application/json,.json", "data-action": "import-bag" }),
        ]),
      ]),
    ]);
  }

  function videoRow(video) {
    return h("div", { class: "video-row" }, [
      h("div", {}, [
        h("a", { href: "#/v/" + encodeURIComponent(video.id), text: video.title || "無題" }),
        h("div", { class: "meta", text: D.kindLabel(video.kind) }),
      ]),
      h("span", { class: "stage", text: D.stageLabel(video.stage) }),
    ]);
  }

  function viewTemplates() {
    return h("div", {}, [
      h("h1", { text: "工程の定型" }),
      h("p", { class: "hint", text: "ここで直すと、すべての動画に同じ文章が出ます。動画ごとのメモは変わりません。" }),
      D.STAGES.map(function (stage) {
        return h("label", { class: "field" }, [
          h("span", { text: stage.label }),
          h("textarea", { rows: "5", "data-template": stage.id, value: state.templates[stage.id] || "" }),
        ]);
      }),
    ]);
  }

  function viewVideo(id) {
    var video = videoById(id);
    if (!video) return h("p", {}, ["台本が見つかりません。", h("a", { href: "#/", text: "一覧へ" })]);
    var template = state.templates[video.stage] || "";
    return h("div", { class: "workspace", style: "grid-template-columns:" + paneWidths.list + "px 8px minmax(0,1fr) 8px " + paneWidths.notes + "px" }, [
      scriptNav(video.id),
      h("div", { class: "pane-split", "data-split": "list", role: "separator", "aria-orientation": "vertical", "aria-label": "左の幅" }),
      h("div", { class: "pane pane-main" }, [
      h("div", { class: "head-row" }, [
        h("div", { style: "flex:1" }, [
          h("p", { class: "print-only", style: "font-size:26px;font-weight:650;margin:0" }, video.title || "無題"),
          h("input", { class: "title-input no-print", type: "text", value: video.title, "data-vfield": "title", "aria-label": "仮タイトル", placeholder: "仮タイトル" }),
          h("div", { class: "row-actions no-print", style: "margin-top:8px" }, [
            h("span", { class: "print-only", text: D.kindLabel(video.kind) }),
            h("select", { "data-vfield": "kind", "aria-label": "種別" }, [
              h("option", { value: "interview", text: "インタビュー", selected: video.kind === "interview" ? "selected" : null }),
              h("option", { value: "dialogue", text: "対談", selected: video.kind === "dialogue" ? "selected" : null }),
            ]),
            h("button", { type: "button", class: "sheet-x", "data-action": "delete-video", "data-id": video.id, text: "×", "aria-label": "この台本を削除" }),
          ]),
        ]),
        h("label", { class: "no-print stage-now" }, [
          h("span", { class: "side-label", text: "今の工程" }),
          h("select", { class: "stage-select", "data-vfield": "stage", "aria-label": "工程" }, D.STAGES.map(function (stage) {
            return h("option", { value: stage.id, text: stage.label, selected: video.stage === stage.id ? "selected" : null });
          })),
        ]),
      ]),
      h("div", { class: "stepper no-print", style: "--steps:" + D.STAGES.length, role: "group", "aria-label": "工程" }, D.STAGES.map(function (stage) {
        var current = video.stage === stage.id;
        return h("button", {
          type: "button",
          class: "step" + (current ? " is-current" : ""),
          "data-action": "set-stage",
          "data-stage": stage.id,
          "aria-current": current ? "step" : null,
        }, [
          h("span", { class: "step-label", text: stage.label }),
          h("span", { class: "step-dot" }),
        ]);
      })),
      h("p", { class: "print-only", text: "種別: " + D.kindLabel(video.kind) }),
      (video.sheets || []).map(function (section) { return sheetSection(video, section); }),
      docSection("動画構成", "流れ", [
        h("div", { class: "card no-print", style: "padding:16px" }, [
          h("div", { class: "toolbar" }, [
            h("button", { type: "button", class: "btn", "data-action": "copy-rundown-prompt", text: "依頼文をコピー" }),
          ]),
          h("label", { class: "field" }, [
            h("span", { text: "ブラウザのAIから戻った進行を貼る" }),
            h("textarea", { rows: "8", "data-ui": "rundownDraft", value: ui.rundownDraft }),
          ]),
          h("button", { type: "button", class: "btn btn-primary", "data-action": "preview-rundown", text: "貼り付けを確認" }),
          video.unread && video.unread.length ? h("div", { class: "unread", text: "読み取れなかった\n" + video.unread.join("\n") }) : null,
        ]),
        video.questions.map(function (q, index) { return questionCard(video, q, index); }),
        h("div", { class: "toolbar no-print", style: "margin-top:12px" }, [
          h("button", { type: "button", class: "btn", "data-action": "add-question", text: "質問を追加" }),
          h("button", { type: "button", class: "btn", "data-action": "copy-spoken-prompt", text: "セリフの依頼文をコピー" }),
          h("button", { type: "button", class: "btn", "data-action": "copy-export", text: "台本をコピー" }),
          h("button", { type: "button", class: "btn", "data-action": "print", text: "印刷" }),
        ]),
        h("div", { class: "card no-print", style: "padding:16px;margin-top:12px" }, [
          h("label", { class: "field" }, [
            h("span", { text: "ブラウザのAIから戻ったセリフを貼る" }),
            h("textarea", { rows: "6", "data-ui": "spokenDraft", value: ui.spokenDraft }),
          ]),
          h("button", { type: "button", class: "btn btn-primary", "data-action": "preview-spoken", text: "セリフの貼り付けを確認" }),
        ]),
      ]),
      ]),
      h("div", { class: "pane-split", "data-split": "notes", role: "separator", "aria-orientation": "vertical", "aria-label": "右の幅" }),
      h("aside", { class: "pane pane-notes no-print" }, [
        h("div", { class: "pane-label" }, [
          h("span", { text: "メモ" }),
          h("span", { class: "stage", text: D.stageLabel(video.stage) }),
        ]),
        template
          ? h("div", { class: "stage-sheet", text: template })
          : h("div", { class: "stage-sheet is-empty", text: "（" + D.stageLabel(video.stage) + "の定型メモ）" }),
        h("label", { class: "stage-sheet" }, [
          h("textarea", {
            rows: "8",
            placeholder: "メモ",
            "aria-label": "この動画のメモ",
            "data-memo": video.stage,
            value: (video.memos && video.memos[video.stage]) || "",
          }),
        ]),
      ]),
    ]);
  }

  function scriptNav(currentId) {
    var clients = state.clients.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    return h("aside", { class: "pane pane-list no-print" }, [
      h("div", { class: "pane-label" }, [
        h("span", { text: "台本" }),
        h("a", { href: "#/", text: "一覧" }),
      ]),
      clients.map(function (client) {
        var videos = state.videos.filter(function (item) { return item.clientId === client.id; })
          .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
        if (!videos.length) return null;
        return h("div", {}, [
          h("div", { class: "pane-client", text: client.name }),
          videos.map(function (item) {
            var current = item.id === currentId;
            return h("a", {
              class: "pane-video" + (current ? " is-current" : ""),
              href: "#/v/" + encodeURIComponent(item.id),
              "aria-current": current ? "page" : null,
            }, [
              h("span", { class: "pane-video-title", text: item.title || "無題" }),
              h("span", { class: "stage", text: D.stageLabel(item.stage) }),
            ]);
          }),
        ]);
      }),
    ]);
  }

  function viewPreview(id) {
    var video = videoById(id);
    if (!video) return h("p", {}, ["台本が見つかりません。", h("a", { href: "#/", text: "一覧へ" })]);
    var sections = (video.sheets || []).map(function (section) {
      var rows = section.fields.filter(function (field) { return !field.quiet && fieldText(video, field).trim(); })
        .map(function (field) { return { label: field.label, value: fieldText(video, field) }; });
      var images = section.id === "shoot" ? video.aroll : [];
      return previewBlock(section.title, rows, images);
    }).filter(Boolean);
    var questions = video.questions.map(function (q, index) {
      return q.text || q.draw || q.spoken || (q.images && q.images.length) ? { q: q, index: index } : null;
    }).filter(Boolean);
    return h("article", { class: "preview" }, [
      h("div", { class: "preview-bar no-print" }, [
        h("a", { class: "btn", href: "#/v/" + encodeURIComponent(video.id), text: "編集に戻る" }),
        h("button", { type: "button", class: "btn btn-primary", "data-action": "print", text: "印刷" }),
      ]),
      h("h1", { text: video.title || "無題" }),
      h("p", { class: "preview-kind", text: D.kindLabel(video.kind) }),
      sections,
      questions.length ? h("section", { class: "preview-section" }, [
        h("h2", { text: "動画構成" }),
        questions.map(function (item) {
          var q = item.q;
          return h("div", { class: "preview-q" }, [
            h("div", {}, [
              h("p", { class: "preview-kicker", text: "質問" + (item.index + 1) }),
              h("p", { class: "preview-lead", text: q.text }),
              q.spoken ? h("p", { class: "preview-spoken", text: q.spoken }) : null,
              video.kind === "dialogue" && (q.asker || q.answerer) ? h("p", { class: "preview-meta", text: [q.asker, q.answerer].filter(Boolean).join(" → ") }) : null,
            ]),
            h("div", {}, [
              q.draw ? h("p", { class: "preview-kicker", text: "引き出したいこと" }) : null,
              q.draw ? h("p", { class: "preview-lead", text: q.draw }) : null,
              q.images && q.images.length ? previewPhotos(q.images) : null,
            ]),
          ]);
        }),
      ]) : null,
    ]);
  }

  function viewReview(key) {
    var video = state.videos.find(function (item) { return item.reviewKey === key; }) || null;
    if (!video) return h("p", { text: "確認できる台本が見つかりません。" });
    var cards = video.questions.map(function (q, index) {
      if (!q.text && !q.spoken && !q.source && !q.revision) return null;
      return reviewCard(q, index);
    }).filter(Boolean);
    return h("article", { class: "review" }, [
      h("h1", { text: video.title || "無題" }),
      h("p", { class: "hint", text: "たたき台は直せます。下の原文は、確認のあいだ変更できません。" }),
      cards.length ? cards : h("p", { class: "empty", text: "確認できる項目はまだありません。" }),
    ]);
  }

  function reviewCard(q, index) {
    var comments = Array.isArray(q.comments) ? q.comments : [];
    var open = ui.commentFor === q.id;
    return h("section", { class: "review-card" }, [
      h("div", { class: "review-head" }, [
        h("h2", { text: "質問" + (index + 1) }),
        h("button", { type: "button", class: "comment-toggle", "data-action": "toggle-comment", "data-qid": q.id, text: "この項目にコメント" }),
      ]),
      q.text ? h("p", { class: "review-q", text: q.text }) : null,
      h("label", { class: "field" }, [
        h("span", { text: "たたき台" }),
        h("textarea", { rows: "8", "data-revision": q.id, value: q.revised ? q.revision : q.spoken }),
      ]),
      q.source ? h("details", { class: "source-box", open: true }, [
        h("summary", { text: "クライアント原文" }),
        h("p", { text: q.source }),
      ]) : null,
      comments.length ? h("ul", { class: "review-comments" }, comments.map(function (comment) {
        return h("li", { text: comment.text });
      })) : null,
      open ? h("div", { class: "comment-box" }, [
        h("textarea", { rows: "3", "data-comment": q.id, "aria-label": "コメント" }),
        h("button", { type: "button", class: "btn", "data-action": "add-comment", "data-qid": q.id, text: "コメントを残す" }),
      ]) : null,
    ]);
  }

  function fieldText(video, field) {
    return field.custom ? field.value || "" : video[field.id] || "";
  }

  function previewBlock(title, rows, images) {
    if (!rows.length && !(images && images.length)) return null;
    return h("section", { class: "preview-section" }, [
      h("h2", { text: title }),
      rows.length ? h("dl", { class: "preview-rows" }, rows.map(function (row) {
        return [h("dt", { text: row.label }), h("dd", { text: row.value })];
      })) : null,
      images && images.length ? previewPhotos(images) : null,
    ]);
  }

  function previewPhotos(images) {
    return h("div", { class: "preview-photos" }, images.map(function (image) {
      return h("figure", {}, [
        h("img", { alt: "", "data-file-id": image.id }),
        image.caption ? h("figcaption", { text: image.caption }) : null,
      ]);
    }));
  }

  function docSection(title, hint, body) {
    return h("section", { class: "doc-section" }, [
      h("header", { class: "doc-head" }, [
        h("span", { class: "doc-mark", "aria-hidden": "true" }),
        h("h2", { text: title }),
        h("span", { class: "doc-rule", "aria-hidden": "true" }),
        h("p", { class: "doc-hint", text: hint }),
      ]),
      h("div", { class: "doc-body" }, body),
    ]);
  }

  function sheetSection(video, section) {
    var rows = section.fields.map(function (field) {
      var row = metaField(video, section, field);
      return field.quiet ? h("div", { class: "no-print" }, [row]) : row;
    });
    rows.push(h("button", { type: "button", class: "add-field no-print", "data-action": "add-field", "data-section": section.id, text: "項目を追加" }));
    if (section.id === "shoot") {
      return docSection(section.title, section.hint, [
        h("div", { class: "split" }, [
          h("div", { class: "main" }, rows),
          imageColumn("Aロール", video.aroll || [], 3, null),
        ]),
      ]);
    }
    return docSection(section.title, section.hint, rows);
  }

  function metaField(video, section, field) {
    var value = field.custom ? field.value || "" : video[field.id] || "";
    var renaming = ui.renaming && ui.renaming.section === section.id && ui.renaming.field === field.id;
    var props = {
      "data-section": section.id,
      "data-field": field.id,
      "aria-label": field.label,
      value: value,
      placeholder: FIELD_HINTS[field.id] || "",
    };
    if (field.custom) props["data-custom"] = "1";
    else props["data-vfield"] = field.id;
    var control = field.multiline ? h("textarea", Object.assign({ rows: "2" }, props)) : h("input", Object.assign({ type: "text" }, props));
    var icon = FIELD_ICONS[field.id] || (field.multiline ? "pencil" : "");
    return h("div", { class: "field sheet-row" }, [
      h("button", { type: "button", class: "sheet-x no-print", "data-action": "delete-field", "data-section": section.id, "data-field": field.id, text: "×", "aria-label": "この項目を削除" }),
      h("div", { class: "sheet-name" }, [
        renaming
          ? h("input", { class: "name-edit", type: "text", value: field.label, "aria-label": "項目名", "data-section": section.id, "data-field": field.id })
          : h("span", { text: field.label, title: "ダブルクリックで名前を変更", "data-field-label": field.id, "data-section": section.id, "data-field": field.id }),
      ]),
      h("div", { class: "sheet-control" + (field.multiline ? " is-multi" : " is-single") }, [
        control,
        icon ? h("span", { class: "sheet-icon icon-" + icon, "aria-hidden": "true" }) : null,
        field.multiline ? h("span", { class: "sheet-count", "aria-hidden": "true", text: value.length + " / 1000" }) : null,
      ]),
    ]);
  }

  function questionCard(video, q, index) {
    var dialogue = video.kind === "dialogue";
    var comments = Array.isArray(q.comments) ? q.comments : [];
    if (!Array.isArray(q.images)) q.images = [];
    return h("div", { class: "question-line" }, [
      h("button", { type: "button", class: "sheet-x no-print", "data-action": "delete-question", "data-index": String(index), text: "×", "aria-label": "この質問を削除" }),
      h("article", { class: "flow-row question", "data-qid": q.id }, [
      h("div", { class: "flow-q" }, [
        h("div", { class: "row-actions" }, [
          h("strong", { text: "質問" + (index + 1) }),
          h("button", { type: "button", class: "btn no-print", "data-action": "move-question", "data-dir": "-1", "data-index": String(index), text: "上へ", disabled: index === 0 }),
          h("button", { type: "button", class: "btn no-print", "data-action": "move-question", "data-dir": "1", "data-index": String(index), text: "下へ", disabled: index === video.questions.length - 1 }),
        ]),
        qField(q, "text", "質問", true),
        qField(q, "intent", "意図", true),
        qField(q, "duration", "目安の尺", false),
        dialogue ? qField(q, "asker", "振る人", false) : null,
        dialogue ? qField(q, "answerer", "答える人", false) : null,
        h("div", { class: "stale", hidden: !D.isStale(q), text: "進行台本とずれている" }),
        qField(q, "spoken", "セリフ", true),
        qField(q, "source", "クライアント原文", true),
        q.revised && q.revision !== q.spoken ? h("div", { class: "revision-note" }, [
          h("p", { class: "hint", text: "クライアントの修正" }),
          h("p", { class: "revision-body", text: q.revision || "（空欄）" }),
          h("button", { type: "button", class: "btn no-print", "data-action": "accept-revision", "data-qid": q.id, text: "セリフに反映" }),
        ]) : null,
        comments.length ? h("ul", { class: "review-comments" }, comments.map(function (comment) {
          return h("li", { text: comment.text });
        })) : null,
      ]),
      h("div", { class: "flow-a" }, [
        qField(q, "draw", "引き出したいこと", true),
        imageColumn("インサート", q.images, 5, q.id),
      ]),
      ]),
    ]);
  }

  function qField(q, prop, label, multiline) {
    var props = { "data-qid": q.id, "data-qprop": prop, value: q[prop] || "" };
    return h("label", { class: "field" }, [
      h("span", { text: label }),
      multiline ? h("textarea", Object.assign({ rows: prop === "spoken" ? "4" : "3" }, props)) : h("input", Object.assign({ type: "text" }, props)),
    ]);
  }

  function imageColumn(label, images, max, questionId) {
    return h("aside", { class: "side" }, [
      h("div", { class: "side-label", text: label + " " + images.length + "/" + max }),
      h("div", { class: "thumbs" }, images.map(function (image, index) {
        return h("div", { class: "thumb-line" }, [
          h("figure", { class: "thumb", "data-qid": questionId || "", "data-image": image.id }, [
            h("img", { alt: "", draggable: "true", "data-file-id": image.id, "data-drag-image": image.id, "data-qid": questionId || "" }),
            h("input", {
              class: "caption",
              type: "text",
              placeholder: "メモ",
              "aria-label": "画像のメモ",
              "data-caption": image.id,
              "data-qid": questionId || "",
              value: image.caption || "",
            }),
          ]),
          h("button", { type: "button", class: "sheet-x no-print", "data-action": "remove-image", "data-id": image.id, "data-qid": questionId || "", text: "×", "aria-label": "画像を外す" }),
        ]);
      })),
      images.length >= max ? h("p", { class: "meta no-print", text: max + "枚までです。" }) : h("label", { class: "btn no-print" }, [
        "画像を追加",
        h("input", {
          class: "file-input",
          type: "file",
          accept: "image/jpeg,image/png,image/webp",
          multiple: "multiple",
          "data-action": questionId ? "add-insert" : "add-aroll",
          "data-qid": questionId || "",
        }),
      ]),
    ]);
  }

  function modalNode() {
    if (!ui.modal) return null;
    var modal = ui.modal;
    return h("dialog", {}, [
      h("div", { class: "modal-body" }, [
        h("h2", { text: modal.title }),
        modal.lines && modal.lines.length ? h("pre", { text: modal.lines.join("\n") }) : null,
        modal.warnings && modal.warnings.length ? h("pre", { text: modal.warnings.join("\n") }) : null,
        modal.unread && modal.unread.length ? h("div", { class: "unread", text: "読み取れなかった\n" + modal.unread.join("\n") }) : null,
        h("div", { class: "toolbar" }, [
          modal.disabled ? null : h("button", { type: "button", class: modal.danger ? "btn btn-danger" : "btn btn-primary", "data-action": "confirm-modal", text: modal.confirmLabel || "置き換える" }),
          h("button", { type: "button", class: "btn", "data-action": "cancel-modal", text: "やめる" }),
        ]),
      ]),
    ]);
  }

  function hydrateImages(root) {
    var pending = [];
    root.querySelectorAll("img[data-file-id]").forEach(function (img) {
      var id = img.getAttribute("data-file-id");
      if (imageCache[id]) img.src = imageCache[id];
      else pending.push(id);
    });
    if (!pending.length) return;
    backend.getImages(pending).then(function (map) {
      Object.keys(map).forEach(function (id) { if (map[id]) imageCache[id] = map[id]; });
      root.querySelectorAll("img[data-file-id]").forEach(function (img) {
        var id = img.getAttribute("data-file-id");
        if (imageCache[id]) img.src = imageCache[id];
        else img.alt = "画像を表示できません";
      });
    }).catch(function () {
      setStatus("画像を表示できません");
    });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-action]");
    if (!button) return;
    var action = button.dataset.action;
    if (action === "create-client") createClient();
    else if (action === "export-bag") exportBag();
    else if (action === "rename-client") { ui.renameId = button.dataset.id; ui.renameValue = clientName(button.dataset.id); render(); }
    else if (action === "save-client-name") saveClientName(button.dataset.id);
    else if (action === "delete-client") askDeleteClient(button.dataset.id);
    else if (action === "start-video") { ui.creatingFor = button.dataset.id; ui.newTitle = ""; ui.newKind = "interview"; render(); }
    else if (action === "create-video") createVideo(button.dataset.id);
    else if (action === "delete-video") askDeleteVideo(button.dataset.id);
    else if (action === "set-stage") setStage(button.dataset.stage);
    else if (action === "add-question") addQuestion();
    else if (action === "delete-question") askDeleteQuestion(Number(button.dataset.index));
    else if (action === "move-question") moveQuestion(Number(button.dataset.index), Number(button.dataset.dir));
    else if (action === "move-image") moveImage(button.dataset.qid, Number(button.dataset.index), Number(button.dataset.dir));
    else if (action === "remove-image") removeImage(button.dataset.qid, button.dataset.id);
    else if (action === "add-field") addField(button.dataset.section);
    else if (action === "delete-field") askDeleteField(button.dataset.section, button.dataset.field);
    else if (action === "copy-rundown-prompt") copyText(D.buildRundownPrompt(currentVideo()), "依頼文をコピーしました");
    else if (action === "copy-spoken-prompt") copyText(D.buildSpokenPrompt(currentVideo()), "セリフの依頼文をコピーしました");
    else if (action === "copy-export") copyText(D.exportText(currentVideo()), "台本をコピーしました");
    else if (action === "print") window.print();
    else if (action === "preview-rundown") previewRundown();
    else if (action === "preview-spoken") previewSpoken();
    else if (action === "request-review") requestReview();
    else if (action === "toggle-comment") { ui.commentFor = ui.commentFor === button.dataset.qid ? "" : button.dataset.qid; render(); }
    else if (action === "add-comment") addComment(button.dataset.qid);
    else if (action === "accept-revision") acceptRevision(button.dataset.qid);
    else if (action === "confirm-modal") confirmModal();
    else if (action === "cancel-modal") { ui.modal = null; render(); }
  });

  document.addEventListener("input", function (event) {
    var target = event.target;
    if (target.dataset.ui) {
      ui[target.dataset.ui] = target.value;
      if (target.dataset.ui === "newKind") return;
      return;
    }
    var video = currentVideo();
    if (!video) {
      if (target.dataset.template) {
        state.templates[target.dataset.template] = target.value;
        enqueue("templates", function () {
          setStatus("保存しています");
          return backend.saveTemplates(Object.assign({}, state.templates));
        });
      }
      return;
    }
    if (route().name === "review") {
      if (!target.dataset.revision) return;
      var reviewed = video.questions.find(function (item) { return item.id === target.dataset.revision; });
      if (!reviewed) return;
      reviewed.revised = true;
      reviewed.revision = target.value;
      touchVideo(video.id);
      return;
    }
    if (target.dataset.caption) {
      var captionList = listFor(video, target.dataset.qid || "");
      var captionImage = captionList && captionList.find(function (image) { return image.id === target.dataset.caption; });
      if (!captionImage) return;
      captionImage.caption = target.value;
      touchVideo(video.id);
      return;
    }
    if (target.dataset.custom) {
      var customField = findField(video, target.dataset.section, target.dataset.field);
      if (!customField) return;
      customField.field.value = target.value;
      var customCount = target.parentElement && target.parentElement.querySelector(".sheet-count");
      if (customCount) customCount.textContent = target.value.length + " / 1000";
      touchVideo(video.id);
      return;
    }
    if (target.dataset.vfield) {
      video[target.dataset.vfield] = target.value;
      var count = target.parentElement && target.parentElement.querySelector(".sheet-count");
      if (count) count.textContent = target.value.length + " / 1000";
      touchVideo(video.id);
      return;
    }
    if (target.dataset.memo) {
      video.memos[target.dataset.memo] = target.value;
      touchVideo(video.id);
      return;
    }
    if (target.dataset.qprop) {
      var q = video.questions.find(function (item) { return item.id === target.dataset.qid; });
      if (!q) return;
      q[target.dataset.qprop] = target.value;
      if (target.dataset.qprop === "spoken") q.spokenSnap = D.fieldSnap(q);
      var card = target.closest(".question");
      var note = card && card.querySelector(".stale");
      if (note) note.hidden = !D.isStale(q);
      touchVideo(video.id);
    }
  });

  document.addEventListener("change", function (event) {
    var target = event.target;
    if (target.dataset.ui === "newKind") { ui.newKind = target.value; return; }
    var video = currentVideo();
    if (!video) return;
    if (target.dataset.vfield === "kind" || target.dataset.vfield === "stage") {
      video[target.dataset.vfield] = target.value;
      saveVideoNow(video.id);
      render();
      return;
    }
    if (target.dataset.action === "import-bag") { importBag(target.files && target.files[0]); return; }
    if (target.dataset.action === "add-aroll" || target.dataset.action === "add-insert") {
      addImages(target, target.dataset.qid || "");
    }
  });

  document.addEventListener("dblclick", function (event) {
    var name = event.target.closest("[data-field-label]");
    if (!name) return;
    ui.renaming = { section: name.dataset.section, field: name.dataset.field, focus: true };
    render();
  });

  document.addEventListener("focusout", function (event) {
    if (event.target.classList && event.target.classList.contains("name-edit")) commitRename(event.target);
  });

  document.addEventListener("keydown", function (event) {
    if (!event.target.classList || !event.target.classList.contains("name-edit")) return;
    if (event.key === "Enter") { event.preventDefault(); event.target.blur(); }
    if (event.key === "Escape") { ui.renaming = null; render(); }
  });

  var imageDrag = null;
  document.addEventListener("dragstart", function (event) {
    var id = event.target.dataset && event.target.dataset.dragImage;
    if (!id) return;
    imageDrag = { id: id, qid: event.target.dataset.qid || "" };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  });
  document.addEventListener("dragover", function (event) {
    var thumb = event.target.closest && event.target.closest(".thumb");
    if (!thumb || !imageDrag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    thumb.classList.add("is-drop");
  });
  document.addEventListener("dragleave", function (event) {
    var thumb = event.target.closest && event.target.closest(".thumb");
    if (thumb) thumb.classList.remove("is-drop");
  });
  document.addEventListener("drop", function (event) {
    var thumb = event.target.closest && event.target.closest(".thumb");
    if (!thumb || !imageDrag) return;
    event.preventDefault();
    reorderImage(imageDrag.qid, imageDrag.id, thumb.dataset.image || "");
    imageDrag = null;
  });
  document.addEventListener("dragend", function () {
    imageDrag = null;
    document.querySelectorAll(".thumb.is-drop").forEach(function (node) { node.classList.remove("is-drop"); });
  });

  var paneDrag = null;
  document.addEventListener("pointerdown", function (event) {
    var split = event.target.closest && event.target.closest(".pane-split");
    if (!split) return;
    event.preventDefault();
    try { split.setPointerCapture(event.pointerId); } catch (err) { /* 合成イベントではキャプチャできない */ }
    paneDrag = { which: split.dataset.split, startX: event.clientX, list: paneWidths.list, notes: paneWidths.notes };
    document.body.classList.add("is-resizing");
  });
  document.addEventListener("pointermove", function (event) {
    if (!paneDrag) return;
    var dx = event.clientX - paneDrag.startX;
    if (paneDrag.which === "list") paneWidths.list = Math.min(480, Math.max(160, paneDrag.list + dx));
    else paneWidths.notes = Math.min(520, Math.max(180, paneDrag.notes - dx));
    var workspace = document.querySelector(".workspace");
    if (workspace) workspace.style.gridTemplateColumns = paneWidths.list + "px 8px minmax(0,1fr) 8px " + paneWidths.notes + "px";
  });
  document.addEventListener("pointerup", function () {
    if (!paneDrag) return;
    paneDrag = null;
    document.body.classList.remove("is-resizing");
    localStorage.setItem("daihon-pane-widths", JSON.stringify(paneWidths));
  });

  window.addEventListener("hashchange", render);
  window.addEventListener("pagehide", function () {
    var video = currentVideo();
    if (video) saveVideoNow(video.id);
  });

  function clientName(id) {
    var client = state.clients.find(function (item) { return item.id === id; });
    return client ? client.name : "";
  }

  function createClient() {
    var name = (ui.newClientName || "").trim();
    if (!name) { setStatus("クライアント名を入力してください"); return; }
    var client = { id: crypto.randomUUID(), name: name, createdAt: new Date().toISOString() };
    state.clients.push(client);
    ui.newClientName = "";
    backend.saveClient(client).then(function () {
      setStatus("保存しました");
      render();
    }, function (err) {
      state.clients = state.clients.filter(function (item) { return item.id !== client.id; });
      setStatus(err.message);
      render();
    });
  }

  function saveClientName(id) {
    var client = state.clients.find(function (item) { return item.id === id; });
    var name = (ui.renameValue || "").trim();
    if (!client || !name) { setStatus("クライアント名を入力してください"); return; }
    client.name = name;
    ui.renameId = "";
    backend.saveClient(client).then(function () { setStatus("保存しました"); render(); }, function (err) { setStatus(err.message); });
  }

  function askDeleteClient(id) {
    var client = state.clients.find(function (item) { return item.id === id; });
    if (!client) return;
    var count = state.videos.filter(function (video) { return video.clientId === id; }).length;
    ui.modal = {
      title: "クライアントを削除します",
      lines: ["「" + client.name + "」と、中の台本" + count + "本を削除します。"],
      confirmLabel: "削除する",
      danger: true,
      onConfirm: function () {
        return backend.deleteClient(id).then(function () {
          state.clients = state.clients.filter(function (item) { return item.id !== id; });
          state.videos = state.videos.filter(function (video) { return video.clientId !== id; });
        });
      },
    };
    render();
  }

  function createVideo(clientId) {
    var title = (ui.newTitle || "").trim();
    if (!title) { setStatus("仮タイトルを入力してください"); return; }
    var now = new Date().toISOString();
    var video = D.normalizeVideo({
      id: crypto.randomUUID(),
      clientId: clientId,
      title: title,
      kind: ui.newKind === "dialogue" ? "dialogue" : "interview",
      stage: "hearing",
      memos: D.emptyTemplates(),
      createdAt: now,
      updatedAt: now,
    });
    state.videos.push(video);
    ui.creatingFor = "";
    backend.saveVideo(video).then(function () {
      location.hash = "#/v/" + encodeURIComponent(video.id);
      render();
    }, function (err) {
      state.videos = state.videos.filter(function (item) { return item.id !== video.id; });
      setStatus(err.message);
      render();
    });
  }

  function setStage(stageId) {
    var video = currentVideo();
    if (!video || !D.stageLabel(stageId)) return;
    video.stage = stageId;
    saveVideoNow(video.id);
    render();
  }

  function askDeleteVideo(id) {
    var video = videoById(id);
    if (!video) return;
    ui.modal = {
      title: "台本を削除します",
      lines: ["「" + (video.title || "無題") + "」を削除します。"],
      confirmLabel: "削除する",
      danger: true,
      onConfirm: function () {
        return backend.deleteVideo(id).then(function () {
          state.videos = state.videos.filter(function (item) { return item.id !== id; });
          location.hash = "#/";
        });
      },
    };
    render();
  }

  function findField(video, sectionId, fieldId) {
    var section = video && (video.sheets || []).find(function (item) { return item.id === sectionId; });
    if (!section) return null;
    var index = section.fields.findIndex(function (field) { return field.id === fieldId; });
    if (index < 0) return null;
    return { section: section, field: section.fields[index], index: index };
  }

  function addField(sectionId) {
    var video = currentVideo();
    var section = video && (video.sheets || []).find(function (item) { return item.id === sectionId; });
    if (!section) return;
    var id = "c_" + crypto.randomUUID();
    section.fields.push({ id: id, label: "新しい項目", multiline: true, custom: true, value: "" });
    ui.renaming = { section: sectionId, field: id, focus: true };
    saveVideoNow(video.id);
    render();
  }

  function askDeleteField(sectionId, fieldId) {
    var video = currentVideo();
    var found = findField(video, sectionId, fieldId);
    if (!found) return;
    var value = found.field.custom ? found.field.value : video[found.field.id];
    var remove = function () {
      if (!found.field.custom && Object.prototype.hasOwnProperty.call(video, found.field.id)) video[found.field.id] = "";
      found.section.fields.splice(found.index, 1);
      return saveVideoNow(video.id);
    };
    if (!value) {
      remove();
      render();
      return;
    }
    ui.modal = {
      title: "「" + found.field.label + "」を削除します",
      lines: ["記入した内容も消えます。"],
      confirmLabel: "削除する",
      danger: true,
      onConfirm: remove,
    };
    render();
  }

  function commitRename(input) {
    var renaming = ui.renaming;
    if (!renaming) return;
    ui.renaming = null;
    var video = currentVideo();
    var found = video && findField(video, renaming.section, renaming.field);
    if (found) {
      var next = input.value.trim();
      if (next) found.field.label = next;
      saveVideoNow(video.id);
    }
    setTimeout(render, 0);
  }

  function addQuestion() {
    var video = currentVideo();
    if (!video) return;
    video.questions.push(D.blankQuestion(crypto.randomUUID()));
    saveVideoNow(video.id);
    render();
  }

  function askDeleteQuestion(index) {
    var video = currentVideo();
    var q = video && video.questions[index];
    if (!q) return;
    var remove = function () {
      video.questions.splice(index, 1);
      return Promise.all(q.images.map(function (image) { return backend.deleteImage(image.id); })).then(function () {
        return saveVideoNow(video.id);
      });
    };
    if (!q.spoken && !(q.images && q.images.length) && !q.text) {
      remove();
      render();
      return;
    }
    ui.modal = {
      title: "質問" + (index + 1) + "を削除します",
      lines: ["この質問のセリフと画像も消えます。"],
      confirmLabel: "削除する",
      danger: true,
      onConfirm: remove,
    };
    render();
  }

  function moveQuestion(index, dir) {
    var video = currentVideo();
    if (!video) return;
    replaceVideo(D.moveQuestion(video, index, dir));
    saveVideoNow(video.id);
    render();
  }

  function listFor(video, questionId) {
    if (!questionId) return video.aroll;
    var q = video.questions.find(function (item) { return item.id === questionId; });
    return q ? q.images : null;
  }

  function reorderImage(questionId, fromId, toId) {
    var video = currentVideo();
    var list = video && listFor(video, questionId);
    if (!list || !fromId || fromId === toId) return;
    var from = list.findIndex(function (image) { return image.id === fromId; });
    var to = list.findIndex(function (image) { return image.id === toId; });
    if (from < 0 || to < 0) return;
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    saveVideoNow(video.id);
    render();
  }

  function moveImage(questionId, index, dir) {
    var video = currentVideo();
    var list = video && listFor(video, questionId);
    var next = index + dir;
    if (!list || next < 0 || next >= list.length) return;
    var item = list.splice(index, 1)[0];
    list.splice(next, 0, item);
    saveVideoNow(video.id);
    render();
  }

  function removeImage(questionId, id) {
    var video = currentVideo();
    var list = video && listFor(video, questionId);
    if (!list) return;
    var index = list.findIndex(function (image) { return image.id === id; });
    if (index < 0) return;
    list.splice(index, 1);
    backend.deleteImage(id).then(function () { return saveVideoNow(video.id); }).then(render);
  }

  function exportBag() {
    var raw = localStorage.getItem(STORAGE_KEY) || "{}";
    var link = h("a", { href: URL.createObjectURL(new Blob([raw], { type: "application/json" })), download: "台本進行の保存.json" });
    document.body.append(link);
    link.click();
    link.remove();
    setStatus("保存を書き出しました");
  }

  function importBag(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var bag = JSON.parse(String(reader.result || ""));
        if (!bag || typeof bag !== "object" || !Array.isArray(bag.videos)) throw new Error("このファイルは台本の保存ではありません");
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bag));
        location.reload();
      } catch (err) {
        setStatus(err && err.message ? err.message : "読み込めませんでした");
      }
    };
    reader.readAsText(file);
  }

  function addImages(input, questionId) {
    var video = currentVideo();
    var list = video && listFor(video, questionId);
    if (!list) return;
    var max = questionId ? 5 : 3;
    var files = Array.prototype.slice.call(input.files || []);
    input.value = "";
    var room = max - list.length;
    if (!room) { setStatus((questionId ? "インサート" : "Aロール") + "は" + max + "枚までです。"); return; }
    var accepted = files.slice(0, room);
    if (files.length > room) setStatus(max + "枚まで追加しました。");
    var chain = Promise.resolve();
    accepted.forEach(function (file) {
      chain = chain.then(function () { return resizeImage(file); }).then(function (dataUrl) {
        imageHold(dataUrl);
        return backend.uploadImage(dataUrl);
      }).then(function (uploaded) {
        imageCache[uploaded.id] = imageHold.last;
        list.push({ id: uploaded.id });
      });
    });
    chain.then(function () { return saveVideoNow(video.id); }).then(render, function (err) {
      setStatus(err && err.message ? err.message : "画像を追加できませんでした");
      render();
    });
  }

  function imageHold(dataUrl) { imageHold.last = dataUrl; }

  function resizeImage(file) {
    var types = ["image/jpeg", "image/png", "image/webp"];
    if (types.indexOf(file.type) < 0) return Promise.reject(new Error("JPEG、PNG、WebPの画像を選んでください"));
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error("画像を処理できませんでした"));
          if (blob.size > MAX_BYTES) return reject(new Error("画像が大きすぎます。1.5MB以下にしてください"));
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.82);
      };
      img.onerror = function () { reject(new Error("画像を読めませんでした")); };
      img.src = url;
    });
  }

  function requestReview() {
    var video = currentVideo();
    if (!video) return;
    if (!video.reviewKey) video.reviewKey = crypto.randomUUID();
    var url = location.origin + location.pathname + "#/r/" + video.reviewKey;
    var message = serverMode
      ? "確認用のURLをコピーしました。原文は変更できません。"
      : "確認用のURLをコピーしました。今はこのブラウザの中だけなので、別のパソコンでは開けません。原文は変更できません。";
    saveVideoNow(video.id).then(function () { copyText(url, message); });
  }

  function addComment(qid) {
    var video = currentVideo();
    var q = video && video.questions.find(function (item) { return item.id === qid; });
    var box = document.querySelector("[data-comment='" + qid + "']");
    var text = box ? box.value.trim() : "";
    if (!q || !text) return;
    if (!Array.isArray(q.comments)) q.comments = [];
    q.comments.push({ id: crypto.randomUUID(), text: text, createdAt: new Date().toISOString() });
    ui.commentFor = "";
    saveVideoNow(video.id).then(render);
  }

  function acceptRevision(qid) {
    var video = currentVideo();
    var q = video && video.questions.find(function (item) { return item.id === qid; });
    if (!q || !q.revised) return;
    q.spoken = q.revision;
    q.spokenSnap = D.fieldSnap(q);
    q.revision = "";
    q.revised = false;
    saveVideoNow(video.id).then(render);
  }

  function copyText(text, message) {
    if (!text) return;
    var done = function () { setStatus(message); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }

  function fallbackCopy(text) {
    var area = h("textarea", { value: text });
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  function previewRundown() {
    var video = currentVideo();
    if (!video) return;
    var parsed = D.parseRundown(ui.rundownDraft || "");
    var applied = D.applyRundown(video, parsed, function () { return crypto.randomUUID(); });
    var useful = parsed.impression != null || parsed.avoid != null || parsed.questions;
    var lines = [];
    lines.push("印象: " + (applied.video.impression || ""));
    lines.push("言わせないこと: " + (applied.video.avoid || ""));
    (parsed.questions || []).forEach(function (q, index) {
      lines.push("質問" + (index + 1) + ": " + (q.text || "（空欄）"));
    });
    ui.modal = {
      title: video.questions.length ? "進行を置き換えます" : "この内容で質問列を作ります",
      lines: lines,
      warnings: applied.warnings,
      unread: parsed.unread,
      disabled: !useful,
      confirmLabel: "置き換える",
      onConfirm: function () {
        var again = D.applyRundown(currentVideo(), parsed, function () { return crypto.randomUUID(); });
        replaceVideo(again.video);
        ui.rundownDraft = "";
        return Promise.all(again.droppedImages.map(function (id) { return backend.deleteImage(id); }))
          .then(function () { return saveVideoNow(again.video.id); });
      },
    };
    render();
  }

  function previewSpoken() {
    var video = currentVideo();
    if (!video) return;
    var parsed = D.parseSpoken(ui.spokenDraft || "");
    var applied = D.applySpoken(video, parsed);
    var numbers = Object.keys(parsed.map);
    ui.modal = {
      title: "セリフを置き換えます",
      lines: numbers.length ? ["入れる番号: " + numbers.join("、")] : ["セリフの見出しがありません。"],
      warnings: applied.warnings,
      unread: applied.video.unread,
      disabled: numbers.length === 0,
      confirmLabel: "置き換える",
      onConfirm: function () {
        var again = D.applySpoken(currentVideo(), parsed);
        replaceVideo(again.video);
        ui.spokenDraft = "";
        return saveVideoNow(again.video.id);
      },
    };
    render();
  }

  function confirmModal() {
    var action = ui.modal && ui.modal.onConfirm;
    ui.modal = null;
    Promise.resolve(action && action()).then(render, function (err) {
      setStatus(err && err.message ? err.message : "保存に失敗しました");
      render();
    });
  }

  backend.load().then(function (loaded) {
    state.clients = loaded.clients || [];
    state.videos = (loaded.videos || []).map(D.normalizeVideo);
    state.templates = Object.assign(D.emptyTemplates(), loaded.templates || {});
    render();
  }, function (err) {
    document.getElementById("app").replaceChildren(h("p", { class: "hint", text: err && err.message ? err.message : "読み込めませんでした" }));
  });
})();
