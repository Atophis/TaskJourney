export class TaskApiError extends Error {
    constructor(message, { status, payload } = {}) {
        super(message);
        this.name = "TaskApiError";
        this.status = status;
        this.payload = payload;
    }
}

function requireTaskId(taskId) {
    if (typeof taskId !== "string" || !taskId.trim()) {
        throw new TypeError("taskId must be a non-empty string");
    }
    return encodeURIComponent(taskId);
}

function normalizeIsoDate(value, fieldName) {
    if (typeof value !== "string") {
        throw new TypeError(`${fieldName} must be a YYYY-MM-DD date`);
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new TypeError(`${fieldName} must be a YYYY-MM-DD date`);
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        year < 1000
        || date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        throw new TypeError(`${fieldName} is not a valid date`);
    }
    return value;
}

export function datePartsToIso({ day, month, year } = {}) {
    const dayText = String(day ?? "").trim();
    const monthText = String(month ?? "").trim();
    const yearText = String(year ?? "").trim();
    if (!/^\d{1,2}$/.test(dayText) || !/^\d{1,2}$/.test(monthText) || !/^\d{4}$/.test(yearText)) {
        throw new TypeError("Enter a valid day, month, and four-digit year");
    }

    return normalizeIsoDate(
        `${yearText}-${monthText.padStart(2, "0")}-${dayText.padStart(2, "0")}`,
        "date",
    );
}

function localDateTimeToIso(dateValue, timeValue) {
    const date = normalizeIsoDate(dateValue, "completion_date");
    if (typeof timeValue !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) {
        throw new TypeError("due_time must be in HH:mm format");
    }

    const localDateTime = new Date(`${date}T${timeValue}:00`);
    const [hour, minute] = timeValue.split(":").map(Number);
    if (
        Number.isNaN(localDateTime.getTime())
        || localDateTime.getFullYear() !== Number(date.slice(0, 4))
        || localDateTime.getMonth() !== Number(date.slice(5, 7)) - 1
        || localDateTime.getDate() !== Number(date.slice(8, 10))
        || localDateTime.getHours() !== hour
        || localDateTime.getMinutes() !== minute
    ) {
        throw new TypeError("completion date and time do not form a valid local time");
    }
    return localDateTime.toISOString();
}

function normalizeMilestones(milestones) {
    if (!Array.isArray(milestones)) {
        throw new TypeError("milestones must be an array of YYYY-MM-DD dates");
    }
    return milestones.map((date) => normalizeIsoDate(date, "milestone"));
}

function normalizeTask(task) {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
        throw new TypeError("task must be an object");
    }

    const nameFields = ["name", "title", "questname"].filter((field) => task[field] !== undefined);
    if (nameFields.length > 1) {
        throw new TypeError("Provide only one of name, title, or questname");
    }
    const rawName = task.name ?? task.title ?? task.questname;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    const descriptionFields = ["description", "desc"].filter((field) => task[field] !== undefined);
    if (descriptionFields.length > 1) {
        throw new TypeError("Provide only one of description or desc");
    }
    const description = task.description ?? task.desc ?? "";
    const difficulty = task.difficulty ?? 1;
    const hasFormDate = task.completion_date !== undefined
        || task.due_time !== undefined
        || task.ddate !== undefined
        || task.dtime !== undefined;
    if (hasFormDate && task.due_date !== undefined) {
        throw new TypeError("Provide due_date or completion_date and due_time, not both");
    }
    if (hasFormDate) {
        const completionDate = task.completion_date ?? task.ddate;
        const dueTime = task.due_time ?? task.dtime;
        if (completionDate === undefined || dueTime === undefined) {
            throw new TypeError("Both completion_date and due_time are required");
        }
    }
    const dueDate = hasFormDate
        ? localDateTimeToIso(task.completion_date ?? task.ddate, task.due_time ?? task.dtime)
        : typeof task.due_date === "string" ? task.due_date.trim() : "";
    const dnotif = task.dnotif;
    if (dnotif !== undefined && typeof dnotif !== "string") {
        throw new TypeError("dnotif must be a string");
    }
    const kind = task.kind ?? "quest";
    const milestones = task.milestones === undefined
        ? undefined
        : normalizeMilestones(task.milestones);

    if (!name) {
        throw new TypeError("name is required");
    }
    if (!dueDate) {
        throw new TypeError("due_date is required");
    }
    if (typeof description !== "string") {
        throw new TypeError("description must be a string");
    }
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
        throw new TypeError("difficulty must be an integer from 1 to 5");
    }
    if (!["quest", "event"].includes(kind)) {
        throw new TypeError("kind must be 'quest' or 'event'");
    }

    return {
        name,
        due_date: dueDate,
        description,
        difficulty,
        kind,
        ...(milestones !== undefined ? { milestones } : {}),
        ...(dnotif !== undefined ? { dnotif } : {}),
    };
}

function normalizeUpdates(updates) {
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        throw new TypeError("updates must be an object");
    }

    const allowedFields = new Set([
        "name",
        "title",
        "questname",
        "description",
        "desc",
        "due_date",
        "completion_date",
        "due_time",
        "ddate",
        "dtime",
        "dnotif",
        "difficulty",
        "status",
        "kind",
        "milestones",
    ]);
    const unsupportedFields = Object.keys(updates).filter(
        (field) => !allowedFields.has(field),
    );
    if (unsupportedFields.length) {
        throw new TypeError(`Unsupported task fields: ${unsupportedFields.join(", ")}`);
    }
    if (!Object.keys(updates).length) {
        throw new TypeError("Provide at least one editable task field");
    }

    const normalized = { ...updates };
    if ("questname" in normalized) {
        if ("name" in normalized || "title" in normalized) {
            throw new TypeError("Provide only one name field");
        }
        normalized.name = normalized.questname;
        delete normalized.questname;
    }
    if ("title" in normalized) {
        if ("name" in normalized) {
            throw new TypeError("Provide only one name field");
        }
        normalized.name = normalized.title;
        delete normalized.title;
    }
    if ("desc" in normalized) {
        if ("description" in normalized) {
            throw new TypeError("Provide only one of description or desc");
        }
        normalized.description = normalized.desc;
        delete normalized.desc;
    }
    const hasFormDate = normalized.completion_date !== undefined
        || normalized.ddate !== undefined
        || normalized.due_time !== undefined
        || normalized.dtime !== undefined;
    if (hasFormDate && normalized.due_date !== undefined) {
        throw new TypeError("Provide due_date or completion_date and due_time, not both");
    }
    if (hasFormDate) {
        const completionDate = normalized.completion_date ?? normalized.ddate;
        const dueTime = normalized.due_time ?? normalized.dtime;
        if (completionDate === undefined || dueTime === undefined) {
            throw new TypeError("Both completion_date and due_time are required");
        }
        normalized.due_date = localDateTimeToIso(
            completionDate,
            dueTime,
        );
        delete normalized.completion_date;
        delete normalized.ddate;
        delete normalized.due_time;
        delete normalized.dtime;
    }
    if ("name" in normalized) {
        if (typeof normalized.name !== "string" || !normalized.name.trim()) {
            throw new TypeError("name cannot be empty");
        }
        normalized.name = normalized.name.trim();
    }
    if ("due_date" in normalized) {
        if (typeof normalized.due_date !== "string" || !normalized.due_date.trim()) {
            throw new TypeError("due_date cannot be empty");
        }
        normalized.due_date = normalized.due_date.trim();
    }
    if ("description" in normalized && typeof normalized.description !== "string") {
        throw new TypeError("description must be a string");
    }
    if ("dnotif" in normalized && typeof normalized.dnotif !== "string") {
        throw new TypeError("dnotif must be a string");
    }
    if (
        "difficulty" in normalized
        && (!Number.isInteger(normalized.difficulty)
            || normalized.difficulty < 1
            || normalized.difficulty > 5)
    ) {
        throw new TypeError("difficulty must be an integer from 1 to 5");
    }
    if ("status" in normalized && typeof normalized.status !== "string") {
        throw new TypeError("status must be a string");
    }
    if ("kind" in normalized && !["quest", "event"].includes(normalized.kind)) {
        throw new TypeError("kind must be 'quest' or 'event'");
    }
    if ("milestones" in normalized) {
        normalized.milestones = normalizeMilestones(normalized.milestones);
    }

    return normalized;
}

async function readPayload(response) {
    const text = await response.text();
    if (!text.trim()) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch {
        if (response.ok) {
            throw new TaskApiError("Task API returned invalid JSON", {
                status: response.status,
                payload: text,
            });
        }
        return { error: text };
    }
}

export function createTaskApi({ baseUrl, getAccessToken, fetchImpl = globalThis.fetch }) {
    if (typeof baseUrl !== "string" || !baseUrl.trim()) {
        throw new TypeError("baseUrl is required");
    }
    const normalizedBaseUrl = baseUrl.trim();
    let parsedBaseUrl;
    try {
        parsedBaseUrl = new URL(normalizedBaseUrl);
    } catch {
        throw new TypeError("baseUrl must be an absolute HTTP or HTTPS URL");
    }
    if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
        throw new TypeError("baseUrl must use HTTP or HTTPS");
    }
    if (typeof getAccessToken !== "function") {
        throw new TypeError("getAccessToken must be a function");
    }
    if (typeof fetchImpl !== "function") {
        throw new TypeError("fetch is not available; provide fetchImpl");
    }

    const apiBase = normalizedBaseUrl.replace(/\/+$/, "");

    async function request(path, { method = "GET", body } = {}) {
        const token = await getAccessToken();
        if (typeof token !== "string" || !token.trim()) {
            throw new Error("An authenticated access token is required");
        }
        const accessToken = token.trim();

        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
        };
        const options = { method, headers };
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        const response = await fetchImpl(`${apiBase}${path}`, options);
        const payload = await readPayload(response);
        if (!response.ok) {
            const message = typeof payload.error === "string"
                ? payload.error
                : `Task API request failed with status ${response.status}`;
            throw new TaskApiError(message, {
                status: response.status,
                payload,
            });
        }
        return payload;
    }

    return Object.freeze({
        async listTasks() {
            const payload = await request("/tasks");
            if (!Array.isArray(payload.tasks)) {
                throw new TaskApiError("Task API response did not contain a tasks array", {
                    payload,
                });
            }
            return payload.tasks;
        },

        async getTask(taskId) {
            const payload = await request(`/tasks/${requireTaskId(taskId)}`);
            if (!payload.task) {
                throw new TaskApiError("Task API response did not contain a task", {
                    payload,
                });
            }
            return payload.task;
        },

        async createTask(task) {
            const payload = await request("/tasks", {
                method: "POST",
                body: normalizeTask(task),
            });
            if (!payload.task) {
                throw new TaskApiError("Task API response did not contain a task", {
                    payload,
                });
            }
            return payload.task;
        },

        async updateTask(taskId, updates) {
            const payload = await request(`/tasks/${requireTaskId(taskId)}`, {
                method: "PUT",
                body: normalizeUpdates(updates),
            });
            if (!payload.task) {
                throw new TaskApiError("Task API response did not contain a task", {
                    payload,
                });
            }
            return payload.task;
        },

        async deleteTask(taskId) {
            return request(`/tasks/${requireTaskId(taskId)}`, {
                method: "DELETE",
            });
        },
    });
}
