import base64
import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

TABLE_NAME = os.environ["TABLE_NAME"]
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

ALLOWED_STATUSES = {"new", "confirmed", "shipped", "delivered", "cancelled"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def json_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "content-type,x-admin-token",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PATCH",
    }


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": json_headers(),
        "body": json.dumps(body),
    }


def extract_method(event):
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", event.get("httpMethod", ""))
        .upper()
    )


def extract_path(event):
    return event.get("rawPath") or event.get("path", "")


def extract_headers(event):
    raw_headers = event.get("headers") or {}
    return {str(k).lower(): str(v) for k, v in raw_headers.items()}


def parse_json_body(event):
    raw_body = event.get("body")
    if raw_body is None or raw_body == "":
        return {}

    if event.get("isBase64Encoded"):
        raw_body = base64.b64decode(raw_body).decode("utf-8")

    try:
        return json.loads(raw_body)
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON body.")


def is_admin(headers):
    if not ADMIN_TOKEN:
        return False
    return headers.get("x-admin-token", "") == ADMIN_TOKEN


def to_native(obj):
    if isinstance(obj, list):
        return [to_native(item) for item in obj]
    if isinstance(obj, dict):
        return {key: to_native(value) for key, value in obj.items()}
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    return obj


def handle_create_order(event):
    payload = parse_json_body(event)
    full_name = str(payload.get("fullName", "")).strip()
    address = str(payload.get("address", "")).strip()
    phone = str(payload.get("phone", "")).strip()
    product = str(payload.get("product", "Pack Animalia Family - 199 dh")).strip()
    message = str(payload.get("message", "")).strip()

    if not full_name or not address or not phone:
        return response(
            400,
            {
                "message": "Missing required fields: fullName, address, and phone are required."
            },
        )

    item = {
        "id": str(uuid.uuid4()),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "fullName": full_name,
        "address": address,
        "phone": phone,
        "product": product,
        "message": message,
        "status": "new",
    }

    table.put_item(Item=item)
    return response(201, {"message": "Order created.", "orderId": item["id"]})


def handle_list_orders(headers):
    if not is_admin(headers):
        return response(401, {"message": "Unauthorized."})

    items = []
    scan_kwargs = {}

    while True:
        result = table.scan(**scan_kwargs)
        items.extend(result.get("Items", []))
        if "LastEvaluatedKey" not in result:
            break
        scan_kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]

    native_items = to_native(items)
    native_items.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return response(200, {"orders": native_items})


def order_id_from_path(path):
    if "/orders/" not in path:
        return ""
    return path.split("/orders/", 1)[1].split("/", 1)[0].strip()


def handle_update_order(event, headers, path):
    if not is_admin(headers):
        return response(401, {"message": "Unauthorized."})

    order_id = order_id_from_path(path)
    if not order_id:
        return response(400, {"message": "Missing order id in path."})

    payload = parse_json_body(event)
    next_status = payload.get("status")

    update_parts = ["updatedAt = :updatedAt"]
    expression_values = {":updatedAt": now_iso()}
    expression_names = {}

    if next_status is not None:
        next_status = str(next_status).strip().lower()
        if next_status not in ALLOWED_STATUSES:
            return response(400, {"message": "Invalid status value."})
        update_parts.append("#status = :status")
        expression_values[":status"] = next_status
        expression_names["#status"] = "status"

    if "notes" in payload:
        update_parts.append("notes = :notes")
        expression_values[":notes"] = str(payload.get("notes", "")).strip()

    if len(update_parts) == 1:
        return response(400, {"message": "No updatable fields provided."})

    try:
        update_kwargs = {
            "Key": {"id": order_id},
            "UpdateExpression": "SET " + ", ".join(update_parts),
            "ExpressionAttributeValues": expression_values,
            "ConditionExpression": "attribute_exists(id)",
            "ReturnValues": "ALL_NEW",
        }

        if expression_names:
            update_kwargs["ExpressionAttributeNames"] = expression_names

        result = table.update_item(**update_kwargs)
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code", "")
        if code == "ConditionalCheckFailedException":
            return response(404, {"message": "Order not found."})
        raise

    return response(200, {"message": "Order updated.", "order": to_native(result["Attributes"])})


def lambda_handler(event, context):
    try:
        method = extract_method(event)
        path = extract_path(event)
        headers = extract_headers(event)

        if method == "OPTIONS":
            return {"statusCode": 204, "headers": json_headers(), "body": ""}

        if method == "POST" and path.endswith("/orders"):
            return handle_create_order(event)

        if method == "GET" and path.endswith("/orders"):
            return handle_list_orders(headers)

        if method == "PATCH" and "/orders/" in path:
            return handle_update_order(event, headers, path)

        return response(404, {"message": "Not found."})
    except ValueError as error:
        return response(400, {"message": str(error)})
