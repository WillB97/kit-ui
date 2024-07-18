import mqtt from "mqtt";
import { version } from "../package.json";

const options = {
  keepalive: 30,
  clientId: "mqttjs_" + Math.random().toString(16).substring(2, 8),
  protocolId: "MQTT",
  protocolVersion: 4,
  clean: true,
  connectTimeout: 60 * 1000,
  // rejectUnauthorized: false,
};

const client = mqtt.connect(MQTT_SERVER, options);
const logMessageRegex = /\[([\.\d]+)(.*)] (.*)/;
let $ = {};
let shouldAutoScroll = true;

window.addEventListener(
  "scroll",
  function (e) {
    const logTable = document.getElementById("log");
    shouldAutoScroll =
      window.scrollY + window.innerHeight >= logTable.scrollHeight;
  },
  {
    passive: true,
  }
);

function robot_connected(connected) {
  if (connected) {
    document.body.classList.add("is-connected");
    $.modals.disconnected.classList.remove("is-active");
  } else {
    document.body.classList.remove("is-connected");
    $.modals.disconnected.classList.add("is-active");
  }
}

window.addEventListener("DOMContentLoaded", (event) => {
  $ = {
    log: document.getElementById("log"),
    templates: {
      logEntry: document.getElementById("tpl-log-entry"),
    },
    themeToggles: [
      document.getElementById("theme-toggle"),
      document.getElementById("mobile-theme-toggle"),
    ],
    themeToggleIcons: [
      document.getElementById("toggle-theme-icon"),
      document.getElementById("mobile-toggle-theme-icon"),
    ],
    modals: {
      disconnected: document.getElementById("modal-disconnected"),
    },
    lastAnnotatedImage: document.getElementById("last-annotated-image"),
    noAnnotatedImageInstructions: document.getElementById(
      "no-annotated-image-instructions"
    ),
  };

  /// Theme Toggle
  const systemIsDark = window.matchMedia(
    "(prefers-color-scheme: dark)"
  ).matches;
  const documentClassList = [...document.body.classList].filter((className) =>
    className.endsWith("-theme")
  );
  if (documentClassList.length === 0) {
    const theme =
      localStorage.getItem("theme") ?? (systemIsDark ? "dark" : "light");

    document.body.classList.add(`${theme}-theme`);
    localStorage.setItem("theme", theme);

    $.themeToggles.forEach((el) => {
      el.style.display = "block";
    });
    $.themeToggleIcons.forEach((el) => {
      el.classList.add(
        theme === "dark" ? "mdi-white-balance-sunny" : "mdi-weather-night"
      );
    });
  }

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (event) => {
      const newTheme = event.matches ? "dark" : "light";

      document.body.classList.remove("dark-theme", "light-theme");
      document.body.classList.add(`${newTheme}-theme`);
      localStorage.setItem("theme", newTheme);

      $.themeToggleIcons.forEach((el) => {
        el.classList.remove("mdi-weather-night", "mdi-white-balance-sunny");
        el.classList.add(
          newTheme === "dark" ? "mdi-white-balance-sunny" : "mdi-weather-night"
        );
      });
    });

  /// Modals

  // Add a click event on modal triggers
  document.querySelectorAll(".modal-trigger").forEach(($trigger) => {
    const modal = $trigger.dataset.target;
    const $target = document.getElementById(modal);

    $trigger.addEventListener("click", () => {
      $target.classList.add("is-active");
    });
  });

  // Add a click event on various child elements to close the parent modal
  document
    .querySelectorAll(
      ".modal-background-close, .modal-close, .modal-card-head .delete, .modal-card-foot .button"
    )
    .forEach(($close) => {
      const $target = $close.closest(".modal");
      if (!$target) return;
      $close.addEventListener("click", () => {
        $target.classList.remove("is-active");
      });
    });

  /// Buttons
  document.querySelectorAll("[data-action]").forEach((el) =>
    el.addEventListener("click", function (e) {
      e.preventDefault();
      switch (e.target.dataset.action) {
        case "start":
          publish_press("start_button");
          break;
        case "reset":
          publish_press("reset");
          break;
        case "stop":
          publish_press("stop");
          break;
        case "clearLog":
          clearLog();
          break;
      }
    })
  );

  $.themeToggles.forEach((el) =>
    el.addEventListener("click", function (e) {
      const currentTheme = localStorage.getItem("theme");
      const newTheme = currentTheme === "light" ? "dark" : "light";

      document.body.classList.remove("dark-theme", "light-theme");
      document.body.classList.add(`${newTheme}-theme`);
      localStorage.setItem("theme", newTheme);

      $.themeToggleIcons.forEach((el) => {
        el.classList.remove("mdi-weather-night", "mdi-white-balance-sunny");
        el.classList.add(
          newTheme === "dark" ? "mdi-white-balance-sunny" : "mdi-weather-night"
        );
      });
    })
  );
});
const status_labels = {
  NoUSB: "No USB",
  Running: "Running",
  Killed: "Killed",
  Finished: "Finished",
  Crashed: "Crashed",
};

client.on("connect", function () {
  document.getElementById("serviceProgress").value = 1;
  console.log("Connected!");
  client.subscribe(MQTT_TOPIC);
});

const disconnected = function (reset = true) {
  document.title = "Robot";
  document.getElementById("serviceProgress").value = 0;
  robot_connected(false);
};

client.on("error", function (err) {
  disconnected();
  console.error(err);
  client.end();
});

client.on("close", disconnected);

const handlers = {
  logs: (contents) => {
    const template = $.templates.logEntry;
    const entryFragment = template.content.cloneNode(true);
    const [_, ts, level_str, message] = contents.message.match(logMessageRegex);
    const level = level_str.trim();

    entryFragment.querySelector(".log-entry").dataset.source = level;
    entryFragment.querySelector(".log-entry__ts").textContent = ts;
    const contentEl = entryFragment.querySelector(".log-entry__content");
    contentEl.innerText = message.replaceAll(" ", String.fromCharCode(0xa0));

    if (level === "- ERROR") {
      contentEl.classList.add("has-text-danger");
    } else if (level === "- WARNING") {
      contentEl.classList.add("has-text-warning");
    } else if (level !== "") {
      // Any other non-usercode log
      contentEl.classList.add(
        "has-text-weight-bold",
        "has-text-centered",
        "is-family-sans-serif"
      );
    }

    $.log.appendChild(entryFragment);
    if (shouldAutoScroll) contentEl.scrollIntoView();
  },
  connected: (contents) => {
    if (contents.state === "connected") {
      robot_connected(true);
    } else {
      robot_connected(false);
    }
  },
  state: (contents) => {
    const statusLabel = status_labels[contents.state];
    document.getElementById("status").textContent = statusLabel;
    document.title = `Robot - ${statusLabel || "Ready"}`;
  },
  start_button: (contents) => {
    if (contents.pressed === true) {
      createPlainLogEntry(
        "▶️ Start button pressed",
        "text-d-blue",
        "text-bold"
      );
    }
  },
  stop: (contents) => {
    if (contents.pressed === true) {
      createPlainLogEntry("💀 Killed", "text-d-red", "text-bold");
    }
  },
  reset: (contents) => {
    if (contents.pressed === true) {
      createPlainLogEntry("🔄 Reset", "text-d-blue", "text-bold");
    }
  },
  "camera/annotated": (contents) => {
    $.noAnnotatedImageInstructions.style.display = "none";
    $.lastAnnotatedImage.src = contents.data;
  },
};

client.on("message", function (topic, payload) {
  let contents = null;
  const subtopic = topic.slice(MQTT_TOPIC.length - 1);
  if (subtopic.startsWith("camera/")) {
    contents = JSON.parse(payload.toString());
    console.log(
      isOwnPayload(contents) ? "🦝" : "🤖",
      topic,
      contents.data.length,
      "bytes",
      contents.data.substring(0, 100)
    );
  } else {
    contents = JSON.parse(payload.toString());
    console.log(isOwnPayload(contents) ? "🦝" : "🤖", topic, contents);
  }
  if (subtopic in handlers) {
    handlers[subtopic](contents);
  }
});

const isOwnPayload = (contents) =>
  contents.hasOwnProperty("sender_name") &&
  contents.sender_name === options.clientId;

function createPlainLogEntry(text, ...classes) {
  const entry = document.createElement("div");
  entry.classList.add("plain-log-entry", ...classes);
  entry.textContent = text;
  $.log.appendChild(entry);

  if (shouldAutoScroll) {
    entry.scrollIntoView();
  }

  return entry;
}

function publish_press(button) {
  console.log("Pressed", button);
  topic_root = MQTT_TOPIC.slice(0, -1);
  client.publish(topic_root + button, JSON.stringify({ pressed: true }));
}

function clearLog() {
  $.log.innerHTML = "";
}
