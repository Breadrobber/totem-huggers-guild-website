const CLASS_COLORS = {
    Warrior: "#c69b6d", Paladin: "#f48cba", Hunter: "#aad372", Rogue: "#fff468",
    Priest: "#ffffff", Shaman: "#4a9eff", Mage: "#3fc7eb", Warlock: "#9fa0f5", Druid: "#ff7c0a",
    "Death Knight": "#e0435a", "Demon Hunter": "#c26fe0", Monk: "#00ff98", Evoker: "#4fc2a8"
  };

  // Class icons in images/class_icons. Classes not listed here show no icon.
  // File names must match exactly, capital letters included.
  const ICON_FOLDER = "images/class_icons/";
  const CLASS_ICONS = {
    Warrior: "warrior.png", Paladin: "paladin.png", Hunter: "hunter.png",
    Rogue: "rogue.png", Priest: "priest.png", Shaman: "shaman.png",
    Mage: "mage.png", Warlock: "warlock.png", Druid: "druid.png",
    Monk: "monk.png", "Death Knight": "deathknight.png",
    "Demon Hunter": "demonhunter.png", Evoker: "evoker.png"
  };

  // Race icons in images/race_icons, named like "orc-male.png" or "nightelf-female.png":
  // race in lowercase with spaces, apostrophes and hyphens removed, then -male or -female.
  const RACE_FOLDER = "images/race_icons/";
  // Races whose file name isn't just the race name with spaces removed
  const RACE_FILE_NAMES = {
    "Mag'har Orc": "maghar",
    "Lightforged Draenei": "lightforged",
    "Dark Iron Dwarf": "darkiron",
    "Highmountain Tauren": "highmountain",
    "Zandalari Troll": "zandalaritroll",
    "Kul Tiran": "kultiranhuman",
    "Earthen": "earthen",
  };
  function raceIcon(p) {
    if (!p.race || !p.gender) return "";
    const base = RACE_FILE_NAMES[p.race] || p.race.toLowerCase().replace(/['\s-]/g, "");
    const file = `${base}-${p.gender.toLowerCase()}.png`;
    // If an icon file is missing, hide it instead of showing a broken image
    return `<img class="class-icon" src="${RACE_FOLDER}${file}" alt="${p.race}" onerror="this.remove()">`;
  }

  // Each character's page on Blizzard's Armory site
  const ARMORY_REGION = "us";       // "eu" for EU realms
  const ARMORY_LOCALE = "en-us";    // "en-gb" for EU

  function armoryLink(p, span, className = "player") {
    if (!p.realm) { span.textContent = p.name; return span; }
    const a = document.createElement("a");
    a.className = className;
    a.href = `https://worldofwarcraft.blizzard.com/${ARMORY_LOCALE}/character/${ARMORY_REGION}/${p.realm}/${encodeURIComponent(p.name.toLowerCase())}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = p.name;
    const icon = document.createElement("span");
    icon.className = "ext";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "↗";
    a.appendChild(icon);
    span.replaceWith(a);
    return a;
  }

  // Blizzard's rendered character portrait, if there is one
  function avatarImg(p) {
    if (!p.avatar) return "";
    return `<img class="avatar" src="${p.avatar}" alt="" loading="lazy" onerror="this.remove()">`;
  }

  let data;
  let currentCategory = null;

  function showBoard(category) {
    if (!document.getElementById("rows")) return;
    currentCategory = category;
    document.querySelectorAll("#tabs button").forEach(b => {
      b.setAttribute("aria-pressed", b.dataset.key === category.key ? "true" : "false");
    });
    document.getElementById("board-title").textContent = category.label;
    document.getElementById("value-heading").textContent = category.column || category.label;

    // Leave out anyone Blizzard had no number for in this category
    const sorted = data.players.filter(p => typeof p.stats[category.key] === "number").sort((a, b) =>
      category.order === "asc"
        ? a.stats[category.key] - b.stats[category.key]
        : b.stats[category.key] - a.stats[category.key]
    );

    const rows = document.getElementById("rows");
    rows.innerHTML = "";
    const search = document.getElementById("board-search").value.trim().toLowerCase();
    let shown = 0;
    let rank = 0, lastValue = null;
    sorted.forEach((p, i) => {
      const value = p.stats[category.key];
      if (value !== lastValue) { rank = i + 1; lastValue = value; } // tied players share a rank
      // Ranks are worked out before filtering, so a searched player keeps their real rank
      if (search && !p.name.toLowerCase().includes(search)) return;
      shown++;
      const tr = document.createElement("tr");
      if (rank <= 3) tr.className = "top r" + rank;
      tr.innerHTML = `
        <td><span class="rank">${rank}</span></td>
        <td class="class-col">${raceIcon(p)}</td>
        <td class="class-col">${CLASS_ICONS[p.class] ? `<img class="class-icon" src="${ICON_FOLDER}${CLASS_ICONS[p.class]}" alt="${p.class}">` : ""}</td>
        <td class="level-col">${p.stats.level ?? ""}</td>
        <td><div class="player-cell">${avatarImg(p)}<span><span class="player"></span><span class="meta"></span></span></div></td>
        <td>${value.toLocaleString()}</td>`;
      const name = armoryLink(p, tr.querySelector(".player"));
      name.style.color = CLASS_COLORS[p.class] || "inherit";
      tr.querySelector(".meta").textContent = `${p.race} ${p.class}`;
      rows.appendChild(tr);
    });
    document.getElementById("rows-no-match").hidden = shown > 0;
  }

  function showRoster() {
    if (!document.getElementById("roster-list")) return;
    const search = document.getElementById("roster-search").value.trim().toLowerCase();
    const matches = search
      ? data.players.filter(p => p.name.toLowerCase().includes(search))
      : data.players;
    const byClass = {};
    matches.forEach(p => (byClass[p.class] ||= []).push(p));
    document.getElementById("roster-count").textContent = search
      ? `${matches.length} of ${data.players.length} members`
      : `${data.players.length} members`;
    document.getElementById("roster-no-match").hidden = matches.length > 0;
    const list = document.getElementById("roster-list");
    list.innerHTML = "";
    Object.keys(byClass).sort().forEach(cls => {
      const members = byClass[cls].sort((a, b) => b.stats.level - a.stats.level);
      const box = document.createElement("div");
      box.className = "class-group";
      box.style.borderTopColor = CLASS_COLORS[cls] || "var(--bronze)";
      const listId = "roster-" + cls.replace(/\s+/g, "-").toLowerCase();
      const startOpen = search.length > 0;
      box.innerHTML = `
        <h3><button class="class-toggle" aria-expanded="${startOpen}" aria-controls="${listId}">
          <span class="arrow" aria-hidden="true">▶</span>
          <span class="name"></span>
          <span class="count"></span>
        </button></h3>
        <ul id="${listId}" ${startOpen ? "" : "hidden"}></ul>`;
      const toggle = box.querySelector(".class-toggle");
      toggle.style.color = CLASS_COLORS[cls] || "inherit";
      toggle.querySelector(".name").textContent = cls;
      toggle.querySelector(".count").textContent = members.length;
      // Click the header to open or close the list of names
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        box.querySelector("ul").hidden = open;
      });
      members.forEach(p => {
        const li = document.createElement("li");
        const nameSpan = document.createElement("span");
        li.appendChild(nameSpan);
        armoryLink(p, nameSpan, "roster-name").style.color = CLASS_COLORS[p.class] || "inherit";
        const lvl = document.createElement("span");
        lvl.textContent = `Lv ${p.stats.level}`;
        li.appendChild(lvl);
        box.querySelector("ul").appendChild(li);
      });
      list.appendChild(box);
    });
  }

  // ----- Composition bar charts -----
  const BREAKDOWNS = [
    { key: "class",  label: "Class",  value: p => p.class, color: v => CLASS_COLORS[v] || "var(--bronze)" },
    { key: "race",   label: "Race",   value: p => p.race,  color: () => "var(--bronze)" },
    { key: "level",  label: "Level",  value: p => levelBand(p.stats.level), color: () => "var(--blood)" },
  ];

  function levelBand(lv) {
    if (typeof lv !== "number") return "Unknown";
    if (lv >= 80) return "80+";
    const low = Math.floor(lv / 10) * 10;
    return `${low}-${low + 9}`;
  }

  function showChart(bd) {
    if (!document.getElementById("bars")) return;
    document.querySelectorAll("#chart-tabs button").forEach(b => {
      b.setAttribute("aria-pressed", b.dataset.key === bd.key ? "true" : "false");
    });
    const counts = {};
    data.players.forEach(p => {
      const v = bd.value(p) || "Unknown";
      counts[v] = (counts[v] || 0) + 1;
    });
    // Levels read best in order; everything else by size
    const entries = Object.entries(counts).sort((a, b) =>
      bd.key === "level" ? b[0].localeCompare(a[0], undefined, { numeric: true }) : b[1] - a[1]
    );
    const most = Math.max(...entries.map(e => e[1]));
    const bars = document.getElementById("bars");
    bars.innerHTML = "";
    entries.forEach(([name, count]) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <span class="bar-label"></span>
        <span class="bar-track"><span class="bar-fill"></span></span>
        <span class="bar-value">${count}</span>`;
      row.querySelector(".bar-label").textContent = name;
      const fill = row.querySelector(".bar-fill");
      fill.style.width = (count / most * 100) + "%";
      fill.style.background = bd.color(name);
      bars.appendChild(row);
    });
  }

  // Mark the menu link for the page we're on
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".menu a").forEach(a => {
    if (a.getAttribute("href") === here) a.classList.add("current");
  });

  fetch("players.json?v=" + Date.now(), { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => {
      data = json;
      const notice = document.getElementById("notice");
      if (notice) notice.hidden = !data.sampleData;
      const stamp = document.getElementById("updated");
      if (stamp) stamp.textContent = `Last updated ${data.updated}`;
      const tabs = document.getElementById("tabs");
      if (tabs) data.categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.textContent = cat.label;
        btn.dataset.key = cat.key;
        btn.addEventListener("click", () => showBoard(cat));
        tabs.appendChild(btn);
      });
      if (tabs) showBoard(data.categories[0]);
      showRoster();
      const chartTabs = document.getElementById("chart-tabs");
      if (chartTabs) BREAKDOWNS.forEach(bd => {
        const btn = document.createElement("button");
        btn.textContent = bd.label;
        btn.dataset.key = bd.key;
        btn.addEventListener("click", () => showChart(bd));
        chartTabs.appendChild(btn);
      });
      if (chartTabs) showChart(BREAKDOWNS[0]);
      document.getElementById("board-search")?.addEventListener("input", () => showBoard(currentCategory));
      document.getElementById("roster-search")?.addEventListener("input", showRoster);
    })
    .catch(() => {
      const t = document.getElementById("board-title");
      if (t) t.textContent = "The data couldn't load";
      if (document.getElementById("rows")) document.getElementById("rows").innerHTML =
        '<tr><td colspan="6">Check that players.json is in the same folder as index.html and that its name is spelled exactly the same.</td></tr>';
    });
