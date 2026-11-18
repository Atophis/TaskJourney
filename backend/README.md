# TaskJourney database starter

`lambda_function.py` is a Python HTTP API handler with a process-local,
in-memory task store. It runs without AWS credentials, boto3, or a DynamoDB
table. The authenticated user's JWT `sub` claim is used as the task owner.

## In-memory storage

Tasks are stored in process memory, grouped by the authenticated user's `sub`.
They remain available while that process runs, then disappear when it stops
or restarts. Separate server instances do not share data.

Create an API Gateway HTTP API with routes `GET /tasks`, `POST /tasks`,
`GET /tasks/{task_id}`, `PUT /tasks/{task_id}`, and `DELETE /tasks/{task_id}`;
connect them to the handler. Configure authentication to supply the JWT `sub`
claim. The handler rejects requests without it and does not trust a user ID
supplied in the request body.

Requests and responses use JSON. A create request requires `name` and
`due_date`; it may also include `description`, integer `difficulty` from 1
through 5, `kind` (`quest` or `event`), and `milestones` (an array of
`YYYY-MM-DD` dates). It may also include `dnotif`, the first reminder time,
which is stored as provided. If omitted, `difficulty` defaults to 1, `kind`
to `quest`, and `milestones` to an empty array. The handler returns a
generated `event_id` in its response.

This is starter storage, not durable production storage. Do not put AWS access
keys in frontend code.

## Run the unit tests

From the TaskJourney repository root, run:

```bash
python3 -m unittest discover -s backend/tests -v
```

The handler uses in-memory storage and does not access AWS.

## Browser JSON connector

`static/js/task_api.mjs` provides a browser client for the task routes above.
It sends JSON and the authenticated user's bearer token to API Gateway; it does
not implement login or store credentials. Supply the API Gateway base URL and
a function that gets a current JWT from your authentication provider:

```js
import { createTaskApi, datePartsToIso } from "/static/js/task_api.mjs";

const taskApi = createTaskApi({
  baseUrl: "https://<api-id>.execute-api.<region>.amazonaws.com",
  getAccessToken: () => authClient.getAccessToken(),
});

const milestoneDates = [...document.querySelectorAll(".milestone-row")]
  .filter((row) => [
    "milestone-day",
    "milestone-month",
    "milestone-year",
  ].some((name) => row.querySelector(`[name=${name}]`).value.trim()))
  .map((row) => datePartsToIso({
    day: row.querySelector("[name=milestone-day]").value,
    month: row.querySelector("[name=milestone-month]").value,
    year: row.querySelector("[name=milestone-year]").value,
  }));

const task = await taskApi.createTask({
  title: titleInput.value,
  description: descriptionInput.value,
  completion_date: datePartsToIso({
    day: completionDayInput.value,
    month: completionMonthInput.value,
    year: completionYearInput.value,
  }),
  due_time: dueTimeInput.value,
  milestones: milestoneDates,
  kind: eventToggle.checked ? "event" : "quest",
  difficulty: 3,
});
```

`due_time` is interpreted in the browser's local time zone and converted to
UTC ISO 8601 for storage. Milestones remain date-only values. The API does not
currently send milestone changes back to an external calendar.

Include a named API Gateway stage in `baseUrl` when the API does not use the
`$default` stage. Configure API Gateway CORS for the web app's origin and the
required methods and headers (`GET`, `POST`, `PUT`, `DELETE`, `Authorization`,
and `Content-Type`). The Flask app can continue serving pages and other
functions; its static route serves this module at `/static/js/task_api.mjs`.

Run the connector tests with:

```bash
node --test backend/tests/task_api.test.mjs
```

The connector tests require Node.js 18 or later.
