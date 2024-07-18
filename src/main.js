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
  },
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
      "no-annotated-image-instructions",
    ),
  };

  /// Theme Toggle
  const systemIsDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  const documentClassList = [...document.body.classList].filter((className) =>
    className.endsWith("-theme"),
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
        theme === "dark" ? "mdi-white-balance-sunny" : "mdi-weather-night",
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
          newTheme === "dark" ? "mdi-white-balance-sunny" : "mdi-weather-night",
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
      ".modal-background-close, .modal-close, .modal-card-head .delete, .modal-card-foot .button",
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
          broadcast("start_button");
          break;
        case "restart":
          sendProcessRequest("restart");
          break;
        case "kill":
          sendProcessRequest("kill");
          break;
        case "clearLog":
          clearLog();
          break;
      }
    }),
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
          newTheme === "dark" ? "mdi-white-balance-sunny" : "mdi-weather-night",
        );
      });
    }),
  );
});
const status_labels = {
  code_crashed: "Crashed",
  code_finished: "Finished",
  code_killed: "Killed",
  code_running: "Running",
  code_starting: "Starting",
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
        "is-family-sans-serif",
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
  "astoria/broadcast/start_button": (contents) => {
    createPlainLogEntry("▶️ Start button pressed", "text-d-blue", "text-bold");
  },
  "camera/annotated": (contents) => {
    $.noAnnotatedImageInstructions.style.display = "none";
    $.lastAnnotatedImage.src = contents.data;
  },
};

const ack = {
  kill: (payload) => {
    const logEntry = createPlainLogEntry(
      "💀 Killed",
      "text-d-red",
      "text-bold",
    );
  },
  restart: (payload) => {
    createPlainLogEntry("🔄 Restart", "text-d-blue", "text-bold");
  },
};

client.on("message", function (topic, payload) {
  let contents = null;
  const subtopic = topic.slice(MQTT_TOPIC.length - 1);
  if (subtopic.startsWith("camera/")) {
    // If the payload is from the camera, just use the raw string.
    try {
      contents = JSON.parse(payload.toString());
      contents = contents.data;
    } catch {
      contents = payload.toString();
    }
    console.log(
      isOwnPayload(contents) ? "🦝" : "🤖",
      topic,
      contents.length,
      "bytes",
      contents.substring(0, 100)
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

function uuid4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

function sendProcessRequest(type) {
  const requestUuid = uuid4();
  handlers[`astoria/astprocd/request/${type}/${requestUuid}`] = (payload) => {
    if (payload.success) {
      ack[type](payload);
    } else {
      const requestTypeName = type.charAt(0).toUpperCase() + type.slice(1);
      const entryText = `💣 ${requestTypeName} failed - ${payload.reason}`;
      createPlainLogEntry(entryText, "text-d-red", "text-bold");
    }
    delete handlers[payload.uuid];
  };
  client.publish(
    `astoria/astprocd/request/${type}`,
    JSON.stringify({
      sender_name: options.clientId,
      uuid: requestUuid,
    }),
  );
}

function sendMutateRequest(attr, value) {
  const requestUuid = uuid4();
  handlers[`astoria/astmetad/request/mutate/${requestUuid}`] = (payload) => {
    if (!payload.success) {
      createPlainLogEntry(`⚠️ ${payload.reason}`, "text-d-orange", "text-bold");
    }
  };
  client.publish(
    "astoria/astmetad/request/mutate",
    JSON.stringify({
      sender_name: options.clientId,
      uuid: requestUuid,
      attr,
      value,
    }),
  );
}

function broadcast(eventName) {
  client.publish(
    `astoria/broadcast/${eventName}`,
    JSON.stringify({
      sender_name: options.clientId,
      event_name: eventName,
      priority: 0,
    }),
  );
}

function clearLog() {
  $.log.innerHTML = "";
}
