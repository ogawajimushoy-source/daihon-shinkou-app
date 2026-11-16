(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Daihon = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var STAGES = [
    { id: "hearing", label: "打ち合わせ" },
    { id: "script", label: "台本" },
    { id: "scout", label: "ロケハン" },
    { id: "shoot", label: "撮影" },
    { id: "edit", label: "編集" },
    { id: "review", label: "最終確認" },
    { id: "done", label: "完了" },
  ];

  var NUMBERED = {
    質問: "text",
    意図: "intent",
    引き出したいこと: "draw",
    尺: "duration",
    振る人: "asker",
    答える人: "answerer",
    セリフ: "spoken",
  };

  var MARKER =
    /^(印象|言わせないこと|質問|意図|引き出したいこと|尺|振る人|答える人|セリフ)(\d*)\s*[:：]\s?(.*)$/;

  function stageLabel(id) {
    for (var i = 0; i < STAGES.length; i++) {
      if (STAGES[i].id === id) return STAGES[i].label;
    }
    return "";
  }

  function emptyTemplates() {
    var out = {};
    STAGES.forEach(function (stage) {
      out[stage.id] = "";
    });
    return out;
  }

  function emptyMemos() {
    return emptyTemplates();
  }

  function fieldSnap(q) {
    return JSON.stringify({
      text: q.text || "",
      intent: q.intent || "",
      draw: q.draw || "",
      duration: q.duration || "",
      asker: q.asker || "",
      answerer: q.answerer || "",
    });
  }

  function isStale(q) {
    return !!(q && q.spoken && q.spokenSnap !== fieldSnap(q));
  }

  function blankQuestion(id) {
    return {
      id: id || "",
      text: "",
      intent: "",
      draw: "",
      duration: "",
      asker: "",
      answerer: "",
      spoken: "",
      spokenSnap: "",
      source: "",
      revision: "",
      revised: false,
      comments: [],
      images: [],
    };
  }

  function cleanComments(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (item) {
      var comment = item && typeof item === "object" ? item : {};
      return {
        id: String(comment.id || ""),
        text: String(comment.text || ""),
        createdAt: String(comment.createdAt || ""),
      };
    }).filter(function (comment) { return comment.text; });
  }

  function normalizeVideo(raw) {
    var v = raw && typeof raw === "object" ? raw : {};
    var memos = emptyMemos();
    var sourceMemos = v.memos && typeof v.memos === "object" ? v.memos : {};
    STAGES.forEach(function (stage) {
      memos[stage.id] = typeof sourceMemos[stage.id] === "string" ? sourceMemos[stage.id] : "";
    });
    var questions = Array.isArray(v.questions) ? v.questions : [];
    return {
      id: String(v.id || ""),
      clientId: String(v.clientId || ""),
      title: String(v.title || ""),
      kind: v.kind === "dialogue" ? "dialogue" : "interview",
      page: String(v.page || ""),
      totalDuration: String(v.totalDuration || ""),
      people: String(v.people || ""),
      persona: String(v.persona || ""),
      mustSay: String(v.mustSay || ""),
      mustNotRaw: String(v.mustNotRaw || ""),
      impression: String(v.impression || ""),
      avoid: String(v.avoid || ""),
      atmosphere: String(v.atmosphere || ""),
      telop: String(v.telop || ""),
      referenceVideo: String(v.referenceVideo || ""),
      arollPlace: String(v.arollPlace || ""),
      cameraCount: String(v.cameraCount || ""),
      requiredInserts: String(v.requiredInserts || ""),
      sheets: normalizeSheets(v.sheets),
      reviewKey: String(v.reviewKey || ""),
      stage: stageLabel(v.stage) ? v.stage : "hearing",
      memos: memos,
      aroll: cleanImages(v.aroll),
      questions: questions.map(function (q, index) {
        var item = q && typeof q === "object" ? q : {};
        return {
          id: String(item.id || "q" + (index + 1)),
          text: String(item.text || ""),
          intent: String(item.intent || ""),
          draw: String(item.draw || ""),
          duration: String(item.duration || ""),
          asker: String(item.asker || ""),
          answerer: String(item.answerer || ""),
          spoken: String(item.spoken || ""),
          spokenSnap: String(item.spokenSnap || ""),
          source: String(item.source || ""),
          revision: String(item.revision || ""),
          revised: !!item.revised,
          comments: cleanComments(item.comments),
          images: cleanImages(item.images),
        };
      }),
      unread: Array.isArray(v.unread) ? v.unread.map(String) : [],
      createdAt: String(v.createdAt || ""),
      updatedAt: String(v.updatedAt || ""),
    };
  }

  function sheetField(id, label, multiline, quiet) {
    return { id: id, label: label, multiline: !!multiline, quiet: !!quiet };
  }

  function defaultSheets() {
    return [
      {
        id: "purpose",
        title: "目的・ターゲット",
        hint: "この動画で、誰に・どんな想いを届けたいですか？",
        fields: [
          sheetField("people", "出る人", false),
          sheetField("page", "置くページ", false),
          sheetField("totalDuration", "全体の尺", false),
          sheetField("impression", "目的", true),
          sheetField("avoid", "言わせないこと", true),
          sheetField("persona", "採用したい人物像", true, true),
          sheetField("mustSay", "言ってほしいこと", true, true),
          sheetField("mustNotRaw", "言わないこと", true, true),
        ],
      },
      {
        id: "tone",
        title: "雰囲気・トーン",
        hint: "動画の雰囲気と、テロップの出し方",
        fields: [sheetField("atmosphere", "動画の雰囲気", true), sheetField("telop", "テロップ", true)],
      },
      {
        id: "reference",
        title: "参考動画",
        hint: "構成の参考にする動画",
        fields: [sheetField("referenceVideo", "動画構成の参考動画", false)],
      },
      {
        id: "shoot",
        title: "撮影イメージ",
        hint: "場所、カメラの台数、入れておきたい画",
        fields: [
          sheetField("arollPlace", "Aロール撮影場所", true),
          sheetField("cameraCount", "カメラの台数", false),
          sheetField("requiredInserts", "必須インサート", true),
        ],
      },
    ];
  }

  function normalizeSheets(raw) {
    if (!Array.isArray(raw) || !raw.length) return defaultSheets();
    return raw.map(function (section, index) {
      var item = section && typeof section === "object" ? section : {};
      var fields = Array.isArray(item.fields) ? item.fields : [];
      return {
        id: String(item.id || "s" + (index + 1)),
        title: String(item.title || "項目"),
        hint: String(item.hint || ""),
        fields: fields.map(function (field, fieldIndex) {
          var source = field && typeof field === "object" ? field : {};
          var next = {
            id: String(source.id || "f" + (fieldIndex + 1)),
            label: String(source.label || "項目"),
            multiline: !!source.multiline,
            quiet: !!source.quiet,
          };
          if (source.custom) {
            next.custom = true;
            next.value = String(source.value || "");
          }
          return next;
        }),
      };
    });
  }

  function sheetLabel(video, id, fallback) {
    var sheets = video.sheets || [];
    for (var i = 0; i < sheets.length; i++) {
      var fields = sheets[i].fields || [];
      for (var j = 0; j < fields.length; j++) {
        if (fields[j].id === id) return fields[j].label || fallback;
      }
    }
    return fallback;
  }

  function sheetHas(video, id) {
    var sheets = video.sheets || [];
    for (var i = 0; i < sheets.length; i++) {
      var fields = sheets[i].fields || [];
      for (var j = 0; j < fields.length; j++) {
        if (fields[j].id === id) return true;
      }
    }
    return false;
  }

  function copyImage(image) {
    return { id: image.id, caption: String(image.caption || "") };
  }

  function cleanImages(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (image) {
        return image && typeof image.id === "string" && image.id;
      })
      .map(function (image) {
        return { id: image.id, caption: String(image.caption || "") };
      });
  }

  function parseBlocks(text) {
    var source = String(text || "")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    var lines = source.split("\n");
    var blocks = [];
    var unread = [];
    var current = null;
    lines.forEach(function (line) {
      var matched = line.match(MARKER);
      if (matched) {
        current = { key: matched[1], n: matched[2] ? Number(matched[2]) : null, lines: [matched[3]] };
        blocks.push(current);
        return;
      }
      if (current) current.lines.push(line);
      else if (line.trim()) unread.push(line);
    });
    blocks.forEach(function (block) {
      block.value = block.lines.join("\n").trim();
    });
    return { blocks: blocks, unread: unread };
  }

  function parseRundown(text) {
    var parsed = parseBlocks(text);
    var impression = null;
    var avoid = null;
    var byNumber = {};
    var unread = parsed.unread.slice();
    parsed.blocks.forEach(function (block) {
      if (block.key === "印象" || block.key === "言わせないこと") {
        if (block.n) {
          unread.push(block.key + block.n + ": " + block.value);
          return;
        }
        if (block.key === "印象") impression = block.value;
        else avoid = block.value;
        return;
      }
      if (block.key === "セリフ") {
        unread.push("セリフ" + (block.n || "") + ": " + block.value);
        return;
      }
      var field = NUMBERED[block.key];
      if (!field || field === "spoken") {
        unread.push(block.key + (block.n || "") + ": " + block.value);
        return;
      }
      if (!block.n) {
        unread.push(block.key + ": " + block.value);
        return;
      }
      if (!byNumber[block.n]) byNumber[block.n] = blankQuestion();
      if (byNumber[block.n]._seen && byNumber[block.n]._seen[field]) {
        unread.push(block.key + block.n + "が重複しています");
        return;
      }
      if (!byNumber[block.n]._seen) byNumber[block.n]._seen = {};
      byNumber[block.n]._seen[field] = true;
      byNumber[block.n][field] = block.value;
    });

    var numbers = Object.keys(byNumber)
      .map(Number)
      .filter(function (n) {
        return n > 0 && n <= 40;
      })
      .sort(function (a, b) {
        return a - b;
      });
    Object.keys(byNumber).forEach(function (key) {
      var n = Number(key);
      if (n > 40) unread.push("質問" + n + "は40本を超えるので入れていません");
    });

    var questions = null;
    var gaps = [];
    if (numbers.length) {
      var max = numbers[numbers.length - 1];
      questions = [];
      for (var n = 1; n <= max; n++) {
        if (!byNumber[n] || !byNumber[n]._seen || !byNumber[n]._seen.text) gaps.push(n);
        var q = byNumber[n] || blankQuestion();
        delete q._seen;
        questions.push(q);
      }
    }
    return { impression: impression, avoid: avoid, questions: questions, gaps: gaps, unread: unread };
  }

  function parseSpoken(text) {
    var parsed = parseBlocks(text);
    var map = {};
    var unread = parsed.unread.slice();
    parsed.blocks.forEach(function (block) {
      if (block.key !== "セリフ") {
        unread.push((block.n ? block.key + block.n : block.key) + ": " + block.value);
        return;
      }
      if (!block.n) {
        unread.push("セリフ: " + block.value);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(map, block.n)) {
        unread.push("セリフ" + block.n + "が重複しています");
        return;
      }
      map[block.n] = block.value;
    });
    return { map: map, unread: unread };
  }

  function applyRundown(video, parsed, idFactory) {
    var current = normalizeVideo(video);
    var next = Object.assign({}, current, {
      impression: parsed.impression == null ? current.impression : parsed.impression,
      avoid: parsed.avoid == null ? current.avoid : parsed.avoid,
      unread: parsed.unread.slice(),
    });
    var warnings = [];
    if (parsed.impression == null) warnings.push("印象の見出しがなかったので、今の印象は残します");
    if (parsed.avoid == null) warnings.push("言わせないことの見出しがなかったので、今の文は残します");
    parsed.gaps.forEach(function (n) {
      warnings.push("質問" + n + "は空欄です");
    });
    if (!parsed.questions) {
      warnings.push("質問の見出しがなかったので、質問列は残します");
      next.questions = current.questions;
      return { video: next, warnings: warnings, droppedImages: [] };
    }
    var droppedImages = [];
    next.questions = parsed.questions.map(function (incoming, index) {
      var prev = current.questions[index];
      var q = blankQuestion(prev && prev.id ? prev.id : idFactory());
      q.text = incoming.text;
      q.intent = incoming.intent;
      q.draw = incoming.draw;
      q.duration = incoming.duration;
      q.asker = incoming.asker;
      q.answerer = incoming.answerer;
      q.spoken = prev ? prev.spoken : "";
      q.spokenSnap = prev ? prev.spokenSnap : "";
      q.source = prev ? prev.source : "";
      q.revision = prev ? prev.revision : "";
      q.revised = prev ? prev.revised : false;
      q.comments = prev ? prev.comments.map(function (comment) {
        return { id: comment.id, text: comment.text, createdAt: comment.createdAt };
      }) : [];
      q.images = prev ? prev.images.map(copyImage) : [];
      return q;
    });
    for (var i = next.questions.length; i < current.questions.length; i++) {
      var removed = current.questions[i];
      var number = i + 1;
      if (removed.spoken) warnings.push("質問" + number + "のセリフは消えます");
      if (removed.images.length) {
        warnings.push("質問" + number + "の画像" + removed.images.length + "枚は消えます");
        removed.images.forEach(function (image) { droppedImages.push(image.id); });
      }
    }
    return { video: next, warnings: warnings, droppedImages: droppedImages };
  }

  function applySpoken(video, parsed) {
    var current = normalizeVideo(video);
    var warnings = [];
    var unread = parsed.unread.slice();
    var present = {};
    Object.keys(parsed.map).forEach(function (key) {
      var n = Number(key);
      if (n < 1 || n > current.questions.length) {
        unread.push("セリフ" + n + "は、対応する質問がないので入れていません");
        return;
      }
      present[n] = parsed.map[key];
    });
    var questions = current.questions.map(function (q, index) {
      var copy = Object.assign({}, q, { images: q.images.map(copyImage) });
      var n = index + 1;
      if (Object.prototype.hasOwnProperty.call(present, n)) {
        copy.spoken = present[n];
        copy.spokenSnap = fieldSnap(copy);
      } else if (copy.spoken) {
        warnings.push("質問" + n + "のセリフは空になります");
        copy.spoken = "";
        copy.spokenSnap = "";
      }
      return copy;
    });
    return {
      video: Object.assign({}, current, { questions: questions, unread: unread }),
      warnings: warnings,
    };
  }

  function moveQuestion(video, index, dir) {
    var current = normalizeVideo(video);
    var nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= current.questions.length) return current;
    var questions = current.questions.slice();
    var item = questions.splice(index, 1)[0];
    questions.splice(nextIndex, 0, item);
    return Object.assign({}, current, { questions: questions });
  }

  function kindLabel(kind) {
    return kind === "dialogue" ? "対談" : "インタビュー";
  }

  function buildRundownPrompt(video) {
    var current = normalizeVideo(video);
    var dialogue = current.kind === "dialogue";
    var lines = [
      "あなたは採用ホームページ向け動画の構成作家です。",
      "次の断片を、候補者に残す印象の1文と、撮影用の質問列に翻訳してください。",
      "出力は、指定した見出しの行だけにしてください。前置きや説明は書かないでください。",
      "値は見出しと同じ行から書き、次の見出しの直前までをその値にしてください。",
      "セリフの本文に、見出しと同じ行は書かないでください。",
      "",
      "出力形式:",
      "印象: （候補者に残す印象を1文）",
      "言わせないこと: （台本全体で言わせないこと。なければ「なし」）",
      "質問1: （質問文）",
      "意図1: （なぜこの質問をこの順で聞くか）",
      "引き出したいこと1: （その場で話してほしい中身）",
      "尺1: （この質問の目安。例: 40秒）",
    ];
    if (dialogue) {
      lines.push("振る人1: （この質問を振る人の名前）");
      lines.push("答える人1: （答える人の名前）");
    }
    lines.push("質問2:");
    lines.push("（以下、質問の数だけ同じ見出しを繰り返す）");
    lines.push("");
    lines.push("断片:");
    lines.push("種別: " + kindLabel(current.kind));
    lines.push("仮タイトル: " + current.title);
    lines.push("採用したい人物像: " + current.persona);
    lines.push("置くページ: " + current.page);
    lines.push("出る人: " + current.people);
    lines.push("全体の尺: " + current.totalDuration);
    lines.push("言ってほしいこと: " + current.mustSay);
    lines.push("言わないこと: " + current.mustNotRaw);
    return lines.join("\n");
  }

  function buildSpokenPrompt(video) {
    var current = normalizeVideo(video);
    var lines = [
      "確定した進行台本から、質問ごとの読み上げセリフを書いてください。",
      "出力は次の見出しだけにしてください。前置きや説明は書かないでください。",
      "値は見出しと同じ行から書き、次の見出しの直前までをその値にしてください。",
      "",
      "出力形式:",
    ];
    var count = Math.max(current.questions.length, 1);
    for (var n = 1; n <= count; n++) lines.push("セリフ" + n + ": （質問" + n + "の読み上げ）");
    lines.push("");
    lines.push("進行:");
    lines.push("印象: " + current.impression);
    lines.push("言わせないこと: " + current.avoid);
    current.questions.forEach(function (q, index) {
      var n = index + 1;
      lines.push("質問" + n + ": " + q.text);
      lines.push("意図" + n + ": " + q.intent);
      lines.push("引き出したいこと" + n + ": " + q.draw);
      lines.push("尺" + n + ": " + q.duration);
      if (current.kind === "dialogue") {
        lines.push("振る人" + n + ": " + q.asker);
        lines.push("答える人" + n + ": " + q.answerer);
      }
    });
    return lines.join("\n");
  }

  function exportText(video) {
    var current = normalizeVideo(video);
    var lines = [current.title || "無題", "種別: " + kindLabel(current.kind), ""];
    [
      ["people", "出る人", current.people],
      ["page", "置くページ", current.page],
      ["totalDuration", "全体の尺", current.totalDuration],
      ["impression", "目的", current.impression],
      ["avoid", "言わせないこと", current.avoid],
      ["atmosphere", "動画の雰囲気", current.atmosphere],
      ["telop", "テロップ", current.telop],
      ["referenceVideo", "参考動画", current.referenceVideo],
      ["arollPlace", "Aロール撮影場所", current.arollPlace],
      ["cameraCount", "カメラの台数", current.cameraCount],
      ["requiredInserts", "必須インサート", current.requiredInserts],
    ].forEach(function (row) {
      if (!sheetHas(current, row[0])) return;
      lines.push(sheetLabel(current, row[0], row[1]) + ": " + row[2]);
    });
    (current.sheets || []).forEach(function (section) {
      (section.fields || []).forEach(function (field) {
        if (field.custom && field.value) lines.push(field.label + ": " + field.value);
      });
    });
    lines.push("");
    current.questions.forEach(function (q, index) {
      var n = index + 1;
      lines.push("質問" + n);
      lines.push("質問文: " + q.text);
      lines.push("意図: " + q.intent);
      lines.push("引き出したいこと: " + q.draw);
      lines.push("目安の尺: " + q.duration);
      if (current.kind === "dialogue") {
        lines.push("振る人: " + q.asker);
        lines.push("答える人: " + q.answerer);
      }
      lines.push("セリフ: " + q.spoken);
      lines.push("");
    });
    return lines.join("\n").trim() + "\n";
  }

  return {
    STAGES: STAGES,
    stageLabel: stageLabel,
    kindLabel: kindLabel,
    emptyTemplates: emptyTemplates,
    fieldSnap: fieldSnap,
    isStale: isStale,
    blankQuestion: blankQuestion,
    normalizeVideo: normalizeVideo,
    parseRundown: parseRundown,
    parseSpoken: parseSpoken,
    applyRundown: applyRundown,
    applySpoken: applySpoken,
    moveQuestion: moveQuestion,
    buildRundownPrompt: buildRundownPrompt,
    buildSpokenPrompt: buildSpokenPrompt,
    exportText: exportText,
  };
});
