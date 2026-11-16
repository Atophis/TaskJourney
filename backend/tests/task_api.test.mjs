import assert from "node:assert/strict";
import test from "node:test";

import {
    createTaskApi,
    datePartsToIso,
    TaskApiError,
} from "../static/js/task_api.mjs";

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    };
}

test("createTask sends the authenticated JSON payload and returns the created task", async () => {
    let capturedUrl;
    let capturedOptions;
    const createdTask = { event_id: "event-1", name: "Finish report" };
    const api = createTaskApi({
        baseUrl: "https://api.example.test/prod/",
        getAccessToken: async () => "jwt-token",
        fetchImpl: async (url, options) => {
            capturedUrl = url;
            capturedOptions = options;
            return jsonResponse(201, { task: createdTask });
        },
    });

    const task = await api.createTask({
        name: " Finish report ",
        due_date: "2026-12-01T18:00:00Z",
        description: "Math assignment",
        difficulty: 4,
    });

    assert.equal(capturedUrl, "https://api.example.test/prod/tasks");
    assert.equal(capturedOptions.method, "POST");
    assert.equal(capturedOptions.headers.Authorization, "Bearer jwt-token");
    assert.equal(capturedOptions.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(capturedOptions.body), {
        name: "Finish report",
        due_date: "2026-12-01T18:00:00Z",
        description: "Math assignment",
        difficulty: 4,
        kind: "quest",
        milestones: [],
    });
    assert.deepEqual(task, createdTask);
});

test("createTask maps the form date parts, time, type, and milestones to JSON", async () => {
    let capturedOptions;
    const api = createTaskApi({
        baseUrl: "https://api.example.test",
        getAccessToken: async () => "jwt-token",
        fetchImpl: async (url, options) => {
            capturedOptions = options;
            return jsonResponse(201, {
                task: { event_id: "event-2", name: "Read chapter" },
            });
        },
    });

    await api.createTask({
        title: "Read chapter",
        description: "Review the assigned reading",
        completion_date: datePartsToIso({ day: "20", month: "11", year: "2026" }),
        due_time: "17:30",
        kind: "event",
        milestones: [
            datePartsToIso({ day: "15", month: "11", year: "2026" }),
            datePartsToIso({ day: "18", month: "11", year: "2026" }),
        ],
    });

    const payload = JSON.parse(capturedOptions.body);
    assert.equal(payload.name, "Read chapter");
    assert.equal(payload.due_date, new Date("2026-11-20T17:30:00").toISOString());
    assert.equal(payload.kind, "event");
    assert.deepEqual(payload.milestones, ["2026-11-15", "2026-11-18"]);
});

test("createTask rejects invalid input before making a request", async () => {
    let requestMade = false;
    const api = createTaskApi({
        baseUrl: "https://api.example.test",
        getAccessToken: async () => "jwt-token",
        fetchImpl: async () => {
            requestMade = true;
            return jsonResponse(201, { task: {} });
        },
    });

    await assert.rejects(
        api.createTask({ name: "   ", due_date: "2026-12-01" }),
        { name: "TypeError", message: "name is required" },
    );
    assert.equal(requestMade, false);
});

test("datePartsToIso rejects impossible calendar dates", () => {
    assert.throws(
        () => datePartsToIso({ day: "30", month: "02", year: "2026" }),
        { name: "TypeError", message: "date is not a valid date" },
    );
});

test("API errors preserve the HTTP status and server message", async () => {
    const api = createTaskApi({
        baseUrl: "https://api.example.test",
        getAccessToken: async () => "jwt-token",
        fetchImpl: async () => jsonResponse(401, { error: "Authentication required" }),
    });

    await assert.rejects(api.listTasks(), (error) => {
        assert.ok(error instanceof TaskApiError);
        assert.equal(error.status, 401);
        assert.equal(error.message, "Authentication required");
        return true;
    });
});
