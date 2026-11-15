const state = {
  tasks: [],
  editingTaskId: null,
};

const elements = {
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  jwtToken: document.getElementById("jwtToken"),
  loadTasksBtn: document.getElementById("loadTasksBtn"),
  clearFormBtn: document.getElementById("clearFormBtn"),
  taskForm: document.getElementById("taskForm"),
  formTitle: document.getElementById("formTitle"),
  submitTaskBtn: document.getElementById("submitTaskBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  formMessage: document.getElementById("formMessage"),
  taskList: document.getElementById("taskList"),
  emptyState: document.getElementById("emptyState"),
  taskCount: document.getElementById("taskCount"),
  taskName: document.getElementById("taskName"),
  taskDueDate: document.getElementById("taskDueDate"),
  taskDifficulty: document.getElementById("taskDifficulty"),
  taskDescription: document.getElementById("taskDescription"),
  taskStatus: document.getElementById("taskStatus"),
};

function setMessage(message, type = "success") {
  elements.formMessage.textContent = message;
  elements.formMessage.className = `message ${type}`;
}

function clearMessage() {
  elements.formMessage.textContent = "";
  elements.formMessage.className = "message";
}

function getApiBaseUrl() {
  return (elements.apiBaseUrl.value || "").trim().replace(/\/$/, "");
}

function getAuthHeaders() {
  const token = (elements.jwtToken.value || "").trim();
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function formatDateTime(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function renderTasks() {
  elements.taskList.innerHTML = "";

  if (!state.tasks.length) {
    elements.emptyState.classList.remove("hidden");
    elements.taskCount.textContent = "0";
    return;
  }

  elements.emptyState.classList.add("hidden");
  elements.taskCount.textContent = String(state.tasks.length);

  state.tasks
    .slice()
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .forEach((task) => {
      const card = document.createElement("article");
      card.className = "task-card";

      const statusClass = `status-${task.status || "open"}`;
      const description = task.description || "No description provided.";

      card.innerHTML = `
        <div class="task-title-row">
          <h3>${escapeHtml(task.name || "Untitled task")}</h3>
        </div>

        <div class="task-meta">
          <span class="badge due">${formatDateTime(task.due_date)}</span>
          <span class="badge difficulty">Difficulty: ${task.difficulty || 1}</span>
          <span class="badge ${statusClass}">${formatStatus(task.status || "open")}</span>
        </div>

        <p class="task-description">${escapeHtml(description)}</p>

        <div class="card-actions">
          <button type="button" class="secondary edit-task-btn" data-task-id="${task.event_id || task.task_id || task.id}">
            Edit
          </button>
          <button type="button" class="danger delete-task-btn" data-task-id="${task.event_id || task.task_id || task.id}">
            Delete
          </button>
        </div>
      `;

      elements.taskList.appendChild(card);
    });

  document.querySelectorAll(".edit-task-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.taskId;
      startEdit(taskId);
    });
  });

  document.querySelectorAll(".delete-task-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.taskId;
      await deleteTask(taskId);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatStatus(status) {
  const labels = {
    open: "Open",
    in_progress: "In progress",
    done: "Done",
  };
  return labels[status] || "Open";
}

async function apiFetch(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error("Please provide an API base URL before loading tasks.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers: getAuthHeaders(),
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && payload.error) ||
      (payload && payload.message) ||
      "Request failed";

    throw new Error(message);
  }

  return payload;
}

async function loadTasks() {
  clearMessage();

  try {
    const result = await apiFetch("/tasks");
    state.tasks = Array.isArray(result.tasks) ? result.tasks : [];
    renderTasks();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function getTaskFormPayload() {
  const name = elements.taskName.value.trim();
  const dueDate = elements.taskDueDate.value;
  const difficulty = Number(elements.taskDifficulty.value);
  const description = elements.taskDescription.value.trim();
  const status = elements.taskStatus.value;

  return {
    name,
    due_date: dueDate,
    description,
    difficulty,
    status,
  };
}

function fillForm(task) {
  elements.taskName.value = task.name || "";
  elements.taskDueDate.value = task.due_date
    ? toLocalDateTimeInput(task.due_date)
    : "";
  elements.taskDifficulty.value = String(task.difficulty || 1);
  elements.taskDescription.value = task.description || "";
  elements.taskStatus.value = task.status || "open";
  elements.formTitle.textContent = "Edit task";
  elements.submitTaskBtn.textContent = "Update task";
  elements.cancelEditBtn.classList.remove("hidden");
}

function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function resetForm() {
  state.editingTaskId = null;
  elements.taskForm.reset();
  elements.taskDifficulty.value = "1";
  elements.taskStatus.value = "open";
  elements.formTitle.textContent = "Create task";
  elements.submitTaskBtn.textContent = "Save task";
  elements.cancelEditBtn.classList.add("hidden");
  clearMessage();
}

async function startEdit(taskId) {
  const task = state.tasks.find((item) => {
    const id = item.event_id || item.task_id || item.id;
    return String(id) === String(taskId);
  });

  if (!task) return;

  state.editingTaskId = taskId;
  fillForm(task);
}

async function createTask(payload) {
  const result = await apiFetch("/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.task;
}

async function updateTask(taskId, payload) {
  const result = await apiFetch(`/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return result.task;
}

async function deleteTask(taskId) {
  try {
    await apiFetch(`/tasks/${taskId}`, {
      method: "DELETE",
    });

    setMessage("Task deleted successfully.", "success");
    await loadTasks();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

elements.loadTasksBtn.addEventListener("click", async () => {
  await loadTasks();
});

elements.clearFormBtn.addEventListener("click", () => {
  resetForm();
});

elements.cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

elements.taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  const base = getApiBaseUrl();
  if (!base) {
    setMessage("Please set the API base URL before submitting.", "error");
    return;
  }

  const payload = getTaskFormPayload();

  if (!payload.name || !payload.name.trim()) {
    setMessage("Task name is required.", "error");
    return;
  }

  if (!payload.due_date) {
    setMessage("Due date is required.", "error");
    return;
  }

  if (!Number.isInteger(payload.difficulty) || payload.difficulty < 1 || payload.difficulty > 5) {
    setMessage("Difficulty must be an integer from 1 to 5.", "error");
    return;
  }

  try {
    if (state.editingTaskId) {
      await updateTask(state.editingTaskId, payload);
      setMessage("Task updated successfully.", "success");
    } else {
      await createTask(payload);
      setMessage("Task created successfully.", "success");
    }

    resetForm();
    await loadTasks();
  } catch (error) {
    setMessage(error.message, "error");
  }
});

resetForm();
renderTasks();