"""Unit tests for the Lambda handler; all DynamoDB access is in memory."""

import copy
import importlib
import json
import sys
import types
import unittest
from unittest.mock import patch


class ConditionalCheckFailedException(Exception):
    pass


class FakeClientError(Exception):
    pass


class FakeTable:
    """Small in-memory stand-in for the DynamoDB calls used by the handler."""

    def __init__(self):
        self.items = {}
        self.meta = types.SimpleNamespace(
            client=types.SimpleNamespace(
                exceptions=types.SimpleNamespace(
                    ConditionalCheckFailedException=ConditionalCheckFailedException
                )
            )
        )

    def get_item(self, *, Key, **kwargs):
        calendar_id = Key["calendar_id"]
        item = self.items.get(calendar_id)
        return {"Item": copy.deepcopy(item)} if item is not None else {}

    def update_item(
        self,
        *,
        Key,
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues=None,
        ConditionExpression=None,
        **kwargs,
    ):
        calendar_id = Key["calendar_id"]
        calendar = self.items.setdefault(calendar_id, {"calendar_id": calendar_id})

        if "if_not_exists" in UpdateExpression:
            calendar.setdefault("events", {})
            return {}

        event_id = ExpressionAttributeNames["#event_id"]
        events = calendar.setdefault("events", {})
        if UpdateExpression.startswith("SET"):
            if ConditionExpression and "attribute_not_exists" in ConditionExpression and event_id in events:
                raise ConditionalCheckFailedException()
            events[event_id] = copy.deepcopy(ExpressionAttributeValues[":event"])
            return {}

        if UpdateExpression.startswith("REMOVE"):
            if ConditionExpression and event_id not in events:
                raise ConditionalCheckFailedException()
            events.pop(event_id, None)
            return {}

        raise AssertionError(f"Unexpected update expression: {UpdateExpression}")


def _load_handler_module():
    fake_table = FakeTable()
    fake_boto3 = types.ModuleType("boto3")
    fake_boto3.resource = lambda *args, **kwargs: types.SimpleNamespace(
        Table=lambda table_name: fake_table
    )
    fake_botocore = types.ModuleType("botocore")
    fake_botocore_exceptions = types.ModuleType("botocore.exceptions")
    fake_botocore_exceptions.ClientError = FakeClientError
    fake_botocore.exceptions = fake_botocore_exceptions

    with patch.dict(
        sys.modules,
        {"boto3": fake_boto3, "botocore": fake_botocore,
         "botocore.exceptions": fake_botocore_exceptions},
    ):
        sys.modules.pop("backend.lambda_function", None)
        module = importlib.import_module("backend.lambda_function")
    return module, fake_table


class LambdaHandlerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module, _ = _load_handler_module()

    def setUp(self):
        self.table = FakeTable()
        self.table.meta.client.exceptions.ConditionalCheckFailedException = (
            ConditionalCheckFailedException
        )
        self.module.TABLE = self.table

    def event(self, method, path="/tasks", body=None, user_id="user-123"):
        return {
            "rawPath": path,
            "body": json.dumps(body) if body is not None else None,
            "requestContext": {
                "http": {"method": method},
                "authorizer": {"jwt": {"claims": {"sub": user_id}}},
            },
        }

    def call(self, event):
        result = self.module.handler(event, None)
        result["json"] = json.loads(result["body"])
        return result

    def test_unauthenticated_request_is_rejected(self):
        result = self.call(self.event("GET", user_id=""))
        self.assertEqual(result["statusCode"], 401)
        self.assertEqual(result["json"]["error"], "Authentication required")
        self.assertEqual(self.table.items, {})

    def test_unknown_route_returns_404(self):
        result = self.call(self.event("GET", "/other"))
        self.assertEqual(result["statusCode"], 404)

    def test_list_returns_calendar_events_sorted_by_due_date(self):
        self.table.items["user-123"] = {
            "calendar_id": "user-123",
            "events": {
                "later": {"event_id": "later", "due_date": "2026-12-02"},
                "sooner": {"event_id": "sooner", "due_date": "2026-11-20"},
            },
        }
        result = self.call(self.event("GET"))
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(
            [task["event_id"] for task in result["json"]["tasks"]],
            ["sooner", "later"],
        )

    def test_create_event_persists_fields_under_calendar(self):
        result = self.call(
            self.event(
                "POST",
                body={
                    "name": "Finish homework",
                    "due_date": "2026-12-01T18:00:00Z",
                    "description": "Math assignment",
                    "difficulty": 4,
                    "kind": "quest",
                    "milestones": ["2026-11-25", "2026-11-29"],
                },
            )
        )
        self.assertEqual(result["statusCode"], 201)
        task = result["json"]["task"]
        self.assertEqual(task["name"], "Finish homework")
        self.assertEqual(task["difficulty"], 4)
        self.assertEqual(task["kind"], "quest")
        self.assertEqual(task["milestones"], ["2026-11-25", "2026-11-29"])
        self.assertIn(task["event_id"], self.table.items["user-123"]["events"])

    def test_create_defaults_kind_and_milestones_for_existing_clients(self):
        result = self.call(
            self.event(
                "POST",
                body={
                    "name": "Read chapter",
                    "due_date": "2026-12-01T18:00:00Z",
                },
            )
        )
        self.assertEqual(result["statusCode"], 201)
        self.assertEqual(result["json"]["task"]["kind"], "quest")
        self.assertEqual(result["json"]["task"]["milestones"], [])

    def test_create_rejects_invalid_milestone_date(self):
        result = self.call(
            self.event(
                "POST",
                body={
                    "name": "Finish homework",
                    "due_date": "2026-12-01T18:00:00Z",
                    "milestones": ["2026-02-30"],
                },
            )
        )
        self.assertEqual(result["statusCode"], 400)
        self.assertIn("milestones must be an array", result["json"]["error"])
        self.assertEqual(self.table.items, {})

    def test_create_rejects_invalid_json(self):
        event = self.event("POST")
        event["body"] = "{bad json"
        result = self.call(event)
        self.assertEqual(result["statusCode"], 400)
        self.assertEqual(self.table.items, {})

    def test_create_rejects_missing_required_name(self):
        result = self.call(self.event("POST", body={"due_date": "2026-12-01"}))
        self.assertEqual(result["statusCode"], 400)
        self.assertIn("name is required", result["json"]["error"])

    def test_get_one_event_returns_404_when_missing(self):
        result = self.call(self.event("GET", "/tasks/no-such-event"))
        self.assertEqual(result["statusCode"], 404)

    def test_get_one_event_returns_event_for_current_user(self):
        task = {"event_id": "event-1", "name": "Read"}
        self.table.items["user-123"] = {"calendar_id": "user-123", "events": {"event-1": task}}
        result = self.call(self.event("GET", "/tasks/event-1"))
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(result["json"]["task"], task)

    def test_update_changes_event_without_touching_other_event(self):
        first = {"event_id": "event-1", "name": "Old name", "difficulty": 2}
        other = {"event_id": "event-2", "name": "Keep me"}
        self.table.items["user-123"] = {
            "calendar_id": "user-123", "events": {"event-1": first, "event-2": other}
        }
        result = self.call(
            self.event(
                "PUT",
                "/tasks/event-1",
                {
                    "name": " New name ",
                    "difficulty": 5,
                    "kind": "event",
                    "milestones": ["2026-11-30"],
                },
            )
        )
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(result["json"]["task"]["name"], "New name")
        self.assertEqual(result["json"]["task"]["difficulty"], 5)
        self.assertEqual(result["json"]["task"]["kind"], "event")
        self.assertEqual(result["json"]["task"]["milestones"], ["2026-11-30"])
        self.assertEqual(self.table.items["user-123"]["events"]["event-2"], other)

    def test_delete_removes_only_requested_event(self):
        self.table.items["user-123"] = {
            "calendar_id": "user-123",
            "events": {"event-1": {"name": "Delete"}, "event-2": {"name": "Keep"}},
        }
        result = self.call(self.event("DELETE", "/tasks/event-1"))
        self.assertEqual(result["statusCode"], 200)
        self.assertNotIn("event-1", self.table.items["user-123"]["events"])
        self.assertIn("event-2", self.table.items["user-123"]["events"])


if __name__ == "__main__":
    unittest.main()
