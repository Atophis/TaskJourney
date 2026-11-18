"""TaskJourney HTTP API handler backed by DynamoDB.

Expected API Gateway HTTP API routes:
  GET    /tasks
  POST   /tasks
  GET    /tasks/{task_id}
  PUT    /tasks/{task_id}
  DELETE /tasks/{task_id}

Configure a JWT authorizer and set TASKS_TABLE. The authenticated user's
JWT `sub` claim is used as the owner key; never accept user_id from the body.
"""

import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import boto3
from botocore.exceptions import ClientError

# boto3 uses the standard AWS credential chain: a local AWS profile when run
# on a developer machine, or the Lambda execution role when deployed.
DYNAMODB = boto3.resource(
    "dynamodb",
    region_name=os.environ.get("DYNAMODB_REGION") or os.environ.get("AWS_REGION"),
)
TABLE = DYNAMODB.Table(os.environ.get("TASKS_TABLE", "dynamo_calendar_events_2"))
CALENDAR_ID_ATTRIBUTE = os.environ.get("CALENDAR_ID_ATTRIBUTE", "calendar_id")


def _response(status_code, body=None):
    return {
        "statusCode": status_code,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body if body is not None else {}, default=_json_default),
    }


def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Cannot JSON encode {type(value).__name__}")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _is_iso_date(value):
    if not isinstance(value, str):
        return False
    try:
        return datetime.strptime(value, "%Y-%m-%d").date().isoformat() == value
    except ValueError:
        return False


def _user_id_from_event(event):
    """Read the user identity set by API Gateway's JWT authorizer."""
    authorizer = event.get("requestContext", {}).get("authorizer", {})
    claims = authorizer.get("jwt", {}).get("claims", {})
    return claims.get("sub")


def _parse_body(event):
    try:
        return json.loads(event.get("body") or "{}")
    except (TypeError, json.JSONDecodeError):
        return None


def handler(event, context):
    """Handle one API Gateway HTTP API request."""
    user_id = _user_id_from_event(event)
    if not user_id:
        return _response(401, {"error": "Authentication required"})

    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("rawPath", "").rstrip("/") or "/"
    parts = [part for part in path.split("/") if part]
    if not parts or parts[0] != "tasks" or len(parts) > 2:
        return _response(404, {"error": "Route not found"})

    task_id = parts[1] if len(parts) == 2 else None
    key = {CALENDAR_ID_ATTRIBUTE: user_id}

    try:
        if method == "GET" and not task_id:
            result = TABLE.get_item(Key=key)
            calendar = result.get("Item", {})
            events = calendar.get("events", {})
            tasks = sorted(events.values(), key=lambda item: item.get("due_date", ""))
            return _response(200, {"tasks": tasks})

        if method == "GET" and task_id:
            result = TABLE.get_item(Key=key)
            calendar = result.get("Item", {})
            task = calendar.get("events", {}).get(task_id)
            return _response(200, {"task": task}) if task else _response(404, {"error": "Task not found"})

        if method == "POST" and not task_id:
            body = _parse_body(event)
            if body is None:
                return _response(400, {"error": "Request body must be valid JSON"})
            name = body.get("name")
            due_date = body.get("due_date")
            if not isinstance(name, str) or not name.strip():
                return _response(400, {"error": "name is required"})
            if not isinstance(due_date, str) or not due_date.strip():
                return _response(400, {"error": "due_date is required"})

            difficulty = body.get("difficulty", 1)
            if not isinstance(difficulty, int) or not 1 <= difficulty <= 5:
                return _response(400, {"error": "difficulty must be an integer from 1 to 5"})
            kind = body.get("kind", "quest")
            if kind not in ("quest", "event"):
                return _response(400, {"error": "kind must be 'quest' or 'event'"})
            milestones = body.get("milestones", [])
            if not isinstance(milestones, list) or not all(_is_iso_date(date) for date in milestones):
                return _response(400, {"error": "milestones must be an array of YYYY-MM-DD dates"})

            now = _now()
            event_id = str(uuid4())
            item = {
                "event_id": event_id,
                "name": name.strip(),
                "due_date": due_date,
                "description": body.get("description", ""),
                "difficulty": difficulty,
                "kind": kind,
                "milestones": milestones,
                "status": "open",
                "created_at": now,
                "updated_at": now,
            }
            # Initialize the map first: DynamoDB cannot create a nested map path
            # and its child in the same UpdateExpression.
            
            TABLE.update_item(
                Key=key,
                UpdateExpression="SET #events = if_not_exists(#events, :empty)",
                ExpressionAttributeNames={"#events": "events"},
                ExpressionAttributeValues={":empty": {}},
            )
            TABLE.update_item(
                Key=key,
                UpdateExpression="SET #events.#event_id = :event",
                ConditionExpression="attribute_not_exists(#events.#event_id)",
                ExpressionAttributeNames={"#events": "events", "#event_id": event_id},
                ExpressionAttributeValues={":event": item},
            )
            return _response(201, {"task": item})

        if method == "PUT" and task_id:
            body = _parse_body(event)
            if body is None:
                return _response(400, {"error": "Request body must be valid JSON"})
            editable = (
                "name",
                "due_date",
                "description",
                "difficulty",
                "status",
                "kind",
                "milestones",
            )
            updates = {name: body[name] for name in editable if name in body}
            if not updates:
                return _response(400, {"error": "Provide at least one editable task field"})
            if "name" in updates and (not isinstance(updates["name"], str) or not updates["name"].strip()):
                return _response(400, {"error": "name cannot be empty"})
            if "difficulty" in updates and (
                not isinstance(updates["difficulty"], int)
                or not 1 <= updates["difficulty"] <= 5
            ):
                return _response(400, {"error": "difficulty must be an integer from 1 to 5"})
            if "kind" in updates and updates["kind"] not in ("quest", "event"):
                return _response(400, {"error": "kind must be 'quest' or 'event'"})
            if "milestones" in updates and (
                not isinstance(updates["milestones"], list)
                or not all(_is_iso_date(date) for date in updates["milestones"])
            ):
                return _response(400, {"error": "milestones must be an array of YYYY-MM-DD dates"})
            if "name" in updates:
                updates["name"] = updates["name"].strip()
            updates["updated_at"] = _now()

            result = TABLE.get_item(Key=key)
            calendar = result.get("Item", {})
            current = calendar.get("events", {}).get(task_id)
            if not current:
                return _response(404, {"error": "Task not found"})
            updated = {**current, **updates}
            result = TABLE.update_item(
                Key=key,
                UpdateExpression="SET #events.#event_id = :event",
                ExpressionAttributeNames={"#events": "events", "#event_id": task_id},
                ExpressionAttributeValues={":event": updated},
                ConditionExpression="attribute_exists(#events.#event_id)",
            )
            return _response(200, {"task": updated})

        if method == "DELETE" and task_id:
            result = TABLE.get_item(Key=key)
            calendar = result.get("Item", {})
            if task_id not in calendar.get("events", {}):
                return _response(404, {"error": "Task not found"})
            TABLE.update_item(
                Key=key,
                UpdateExpression="REMOVE #events.#event_id",
                ExpressionAttributeNames={"#events": "events", "#event_id": task_id},
                ConditionExpression="attribute_exists(#events.#event_id)",
            )
            return _response(200, {"deleted": True, "task_id": task_id})

        return _response(405, {"error": "Method not allowed"})

    except TABLE.meta.client.exceptions.ConditionalCheckFailedException:
        return _response(404, {"error": "Task not found"})
    except ClientError:
        # Log the detailed exception to CloudWatch in production; keep internal
        # AWS details out of the response sent to the browser.
        return _response(500, {"error": "Database request failed"})
