# TaskJourney database starter

`lambda_function.py` is a Python AWS Lambda handler for an API Gateway **HTTP
API**. Lambda is the AWS service that runs this handler when an HTTP request
arrives; API Gateway provides the web URL and routes requests to it. The
handler uses the authenticated user's JWT `sub` claim as the task owner and
calls DynamoDB with the Lambda execution role.

## Existing table shape

Your table has a single partition key:

- Partition key: `calendar_id` (String)
- No sort key

Because a DynamoDB table without a sort key can contain only one top-level
item for each `calendar_id`, this starter stores events in an `events` map on
that calendar item, keyed by `event_id`. Event values include `name`,
`due_date`, `description`, `difficulty`, `status`, `created_at`, and
`updated_at`. The table's 400 KB item size limit applies to all events in a
calendar combined.

The handler maps the authenticated user's JWT `sub` value to `calendar_id`.
Set `CALENDAR_ID_ATTRIBUTE` only if the partition key attribute has a different
name. The table name defaults to `dynamo_calendar_events_2` and can be changed
with `TASKS_TABLE`.

## AWS setup

1. Configure the Lambda runtime as Python and the handler as
   `lambda_function.handler`.
2. The handler defaults to `dynamo_calendar_events_2`. Set `TASKS_TABLE` if
   needed. By default, boto3 uses the Lambda function's AWS region; set
   `DYNAMODB_REGION` only if the table is in a different region.
3. Give the Lambda execution role `dynamodb:Query`, `GetItem`, `PutItem`,
   `UpdateItem`, and `DeleteItem` permissions on this table only.
4. Create an API Gateway HTTP API with routes `GET /tasks`, `POST /tasks`,
   `GET /tasks/{task_id}`, `PUT /tasks/{task_id}`, and
   `DELETE /tasks/{task_id}`; connect them to this Lambda.
5. Configure a JWT authorizer on every route. The handler rejects requests
   without an authenticated `sub` claim and does not trust a user ID supplied
   in the request body.

Requests and responses use JSON. A create request requires `name` and
`due_date`; it may also include `description` and integer `difficulty` from 1
through 5. The handler returns a generated `event_id` in its response.

This is a starter API, not a deployed service. API Gateway, the Lambda role,
table permissions, and user authentication still need to be configured in
AWS. Do not put AWS access keys in frontend code.
