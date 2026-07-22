#!/usr/bin/env python3
"""Exercise route ownership RLS against only the disposable local Supabase stack.

The harness deliberately uses the local Auth password endpoint to obtain normal
user JWTs. Database access is limited to fixture setup/cleanup through the local
Docker Postgres container; no service-role credential is read or sent to the API.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass
from http.client import HTTPResponse
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


LOCAL_URL_ENV = "CLIMBSET_LOCAL_SUPABASE_URL"
DEFAULT_LOCAL_URL = "http://127.0.0.1:54321"
DB_CONTAINER_ENV = "CLIMBSET_LOCAL_DB_CONTAINER"
DEFAULT_DB_CONTAINER = "supabase_db_climbset-supabase"
PASSWORD = "ClimbSetHarness-2026!"
INSTANCE_ID = "00000000-0000-0000-0000-000000000000"

OWNER_ID = "2c6f6f39-3b0e-4d8b-8b8d-2c8a9f6b4c11"
OTHER_ID = "7a4e2d80-6c35-49d2-8d2e-51ec2dd09322"
OWNER_ROUTE_ID = "b5f0d878-5d47-4db8-90a5-3c5bc73f7c31"
PROTECTED_ROUTE_ID = "d2f7e93e-8a59-45a8-b3cb-4d5ef7bd2314"
NULL_OWNER_ROUTE_ID = "f3c4a8d1-9b62-4f27-8a4c-6e0d2b1f8357"
INSERTED_ROUTE_ID = "e8a1f57c-6d32-4bd1-9e48-2f0c7a6b9135"

OWNER_EMAIL = "climbset-rls-harness-owner@local.invalid"
OTHER_EMAIL = "climbset-rls-harness-other@local.invalid"
ROUTE_MARKER = "__climbset_rls_harness__"


class HarnessError(RuntimeError):
    pass


@dataclass(frozen=True)
class User:
    id: str
    email: str


@dataclass
class ApiResult:
    status: int
    body: object


def fail(message: str) -> None:
    raise HarnessError(message)


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def run_psql(sql: str) -> str:
    container = os.environ.get(DB_CONTAINER_ENV, DEFAULT_DB_CONTAINER)
    if not container.startswith("supabase_db_"):
        fail(
            f"refusing database container {container!r}; "
            "CLIMBSET_LOCAL_DB_CONTAINER must name the disposable supabase_db_* container"
        )
    try:
        completed = subprocess.run(
            [
                "docker",
                "exec",
                container,
                "psql",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                "postgres",
                "-d",
                "postgres",
                "-Atqc",
                sql,
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        fail(f"local disposable database unavailable: {exc}")
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        fail(f"local disposable database unavailable or SQL failed: {detail}")
    return completed.stdout.strip()


def ensure_backend(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        fail(
            f"refusing Supabase URL {url!r}; this harness only permits an HTTP loopback URL "
            "and cannot target production"
        )
    base = url.rstrip("/")
    try:
        health = expect_api_result(
            request_json("GET", f"{base}/auth/v1/health"),
            "local Auth health",
        )
        if health.status != 200 or not isinstance(health.body, dict) or health.body.get("name") != "GoTrue":
            fail(f"unexpected local Auth health response: HTTP {health.status} {health.body!r}")
        rest = expect_api_result(
            request_json("GET", f"{base}/rest/v1/routes?select=id&limit=1"),
            "local PostgREST health",
        )
        if rest.status != 200:
            fail(f"unexpected local PostgREST health response: HTTP {rest.status} {rest.body!r}")
    except Exception as exc:
        fail(
            f"local disposable Supabase backend unavailable at {url}: {exc}. "
            "Start supabase_db_climbset-supabase and its local API gateway first"
        )


def request_json(method: str, url: str, token: str | None = None, payload: object | None = None) -> ApiResult | object:
    headers = {"Accept": "application/json"}
    if method in {"POST", "PATCH", "DELETE"}:
        headers["Prefer"] = "return=representation"
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=15) as response:
            return decode_response(response)
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body: object = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            body = raw
        return ApiResult(exc.code, body)
    except (URLError, TimeoutError, OSError) as exc:
        fail(f"HTTP {method} {url} failed: {exc}")


def decode_response(response: HTTPResponse) -> ApiResult | object:
    raw = response.read().decode("utf-8", errors="replace")
    if not raw:
        return ApiResult(response.status, None)
    try:
        return ApiResult(response.status, json.loads(raw))
    except json.JSONDecodeError:
        return ApiResult(response.status, raw)


def request_storage(
    method: str,
    base: str,
    key: str,
    token: str | None = None,
    payload: bytes | None = None,
) -> ApiResult | object:
    headers = {"Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "image/jpeg"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"{base}/storage/v1/object/walls/{quote(key, safe='/')}"
    request = Request(url, data=payload, headers=headers, method=method)
    try:
        with urlopen(request, timeout=15) as response:
            return decode_response(response)
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body: object = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            body = raw
        return ApiResult(exc.code, body)
    except (URLError, TimeoutError, OSError) as exc:
        fail(f"Storage HTTP {method} {url} failed: {exc}")




def storage_metadata_count(key: str) -> int:
    result = run_psql(
        "SELECT count(*) FROM storage.objects "
        f"WHERE bucket_id = 'walls' AND name = {sql_quote(key)};"
    )
    try:
        return int(result)
    except ValueError:
        fail(f"unexpected Storage metadata count for {key!r}: {result!r}")


def assert_storage_absent(base: str, key: str, description: str) -> None:
    result = expect_api_result(
        request_storage("GET", base, key),
        f"{description} object lookup",
    )
    if result.status not in {400, 404}:
        fail(f"{description}: expected missing object, HTTP {result.status} {result.body!r}")
    count = storage_metadata_count(key)
    if count != 0:
        fail(f"{description}: rejected upload left {count} Storage metadata row(s)")


def assert_storage_ownership(base: str, owner_token: str, other_token: str) -> None:
    wall_id = f"rls-harness-wall-{uuid.uuid4().hex}"
    owner_key = f"{OWNER_ID}/{wall_id}/owner.jpg"
    non_owner_key = f"{OWNER_ID}/{wall_id}/non-owner.jpg"
    legacy_key = f"{wall_id}/legacy.jpg"
    upload = b"climbset-storage-rls-harness"
    created_keys: list[str] = []

    for key in (owner_key, non_owner_key, legacy_key):
        assert_storage_absent(base, key, f"unique fixture key {key}")

    try:
        owner_result = expect_api_result(
            request_storage("POST", base, owner_key, owner_token, upload),
            "owner-prefixed owner upload",
        )
        if owner_result.status not in {200, 201}:
            fail(f"owner-prefixed owner upload failed: HTTP {owner_result.status} {owner_result.body!r}")
        created_keys.append(owner_key)
        if storage_metadata_count(owner_key) != 1:
            fail("owner-prefixed owner upload did not create exactly one metadata row")

        owner_object = expect_api_result(
            request_storage("GET", base, owner_key),
            "owner-prefixed owner object read",
        )
        if owner_object.status != 200:
            fail(f"owner-prefixed owner object is not readable: HTTP {owner_object.status} {owner_object.body!r}")

        non_owner_result = expect_api_result(
            request_storage("POST", base, non_owner_key, other_token, upload),
            "non-owner owner-prefix upload",
        )
        if 200 <= non_owner_result.status < 300:
            created_keys.append(non_owner_key)
            fail(f"non-owner owner-prefix upload unexpectedly succeeded: HTTP {non_owner_result.status}")
        assert_storage_absent(base, non_owner_key, "non-owner owner-prefix rejection")

        legacy_result = expect_api_result(
            request_storage("POST", base, legacy_key, owner_token, upload),
            "owner legacy-prefix upload",
        )
        if 200 <= legacy_result.status < 300:
            created_keys.append(legacy_key)
            fail(f"owner legacy-prefix upload unexpectedly succeeded: HTTP {legacy_result.status}")
        assert_storage_absent(base, legacy_key, "owner legacy-prefix rejection")
        print("PASS: owner-prefixed Storage upload succeeded; non-owner and legacy-prefix uploads were rejected cleanly")
    finally:
        for key in created_keys:
            delete_result = expect_api_result(
                request_storage("DELETE", base, key, owner_token),
                f"cleanup Storage object {key}",
            )
            if delete_result.status not in {200, 204}:
                fail(f"cleanup Storage object {key} failed: HTTP {delete_result.status} {delete_result.body!r}")
            assert_storage_absent(base, key, f"cleanup Storage object {key}")


def expect_api_result(result: ApiResult | object, description: str) -> ApiResult:
    if not isinstance(result, ApiResult):
        fail(f"{description}: expected HTTP result, got {result!r}")
    return result


def login(base: str, user: User) -> str:
    result = expect_api_result(
        request_json(
            "POST",
            f"{base}/auth/v1/token?grant_type=password",
            payload={"email": user.email, "password": PASSWORD},
        ),
        f"login for {user.email}",
    )
    if result.status != 200 or not isinstance(result.body, dict) or not result.body.get("access_token"):
        fail(f"login for {user.email} failed: HTTP {result.status} {result.body!r}")
    if result.body.get("user", {}).get("id") != user.id:
        fail(f"login for {user.email} returned wrong user ID: {result.body!r}")
    return str(result.body["access_token"])


def setup_fixtures() -> None:
    users = [(OWNER_ID, OWNER_EMAIL), (OTHER_ID, OTHER_EMAIL)]
    user_ids = ", ".join(sql_quote(user_id) for user_id, _ in users)
    route_ids = ", ".join(
        sql_quote(route_id)
        for route_id in (OWNER_ROUTE_ID, PROTECTED_ROUTE_ID, NULL_OWNER_ROUTE_ID, INSERTED_ROUTE_ID)
    )
    expected_emails = ", ".join(sql_quote(email) for _, email in users)
    marker = sql_quote(ROUTE_MARKER)
    app_metadata = sql_quote(json.dumps({"provider": "email", "providers": ["email"]}, separators=(",", ":")))
    owner_metadata = sql_quote(
        json.dumps({"sub": OWNER_ID, "email": OWNER_EMAIL, "email_verified": True}, separators=(",", ":"))
    )
    other_metadata = sql_quote(
        json.dumps({"sub": OTHER_ID, "email": OTHER_EMAIL, "email_verified": True}, separators=(",", ":"))
    )
    sql = f"""
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id IN ({user_ids}) AND email NOT IN ({expected_emails})
  ) THEN
    RAISE EXCEPTION 'fixed RLS harness user ID is already occupied by a different user';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.routes
    WHERE id IN ({route_ids})
      AND position({marker} IN name) <> 1
  ) THEN
    RAISE EXCEPTION 'fixed RLS harness route ID is already occupied by a different route';
  END IF;
END $$;
DELETE FROM public.routes WHERE id IN ({route_ids});
DELETE FROM auth.users WHERE id IN ({user_ids});
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, is_anonymous
) VALUES
  ({sql_quote(INSTANCE_ID)}, {sql_quote(OWNER_ID)}, 'authenticated', 'authenticated',
   {sql_quote(OWNER_EMAIL)}, crypt({sql_quote(PASSWORD)}, gen_salt('bf')), now(),
   '', '', '', '', '', '', {app_metadata}::jsonb,
   {owner_metadata}::jsonb,
   false, now(), now(), false),
  ({sql_quote(INSTANCE_ID)}, {sql_quote(OTHER_ID)}, 'authenticated', 'authenticated',
   {sql_quote(OTHER_EMAIL)}, crypt({sql_quote(PASSWORD)}, gen_salt('bf')), now(),
   '', '', '', '', '', '', {app_metadata}::jsonb,
   {other_metadata}::jsonb,
   false, now(), now(), false);
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ({sql_quote(OWNER_ID)}, {sql_quote(OWNER_ID)},
   jsonb_build_object('sub', {sql_quote(OWNER_ID)}, 'email', {sql_quote(OWNER_EMAIL)}),
   'email', now(), now(), now()),
  ({sql_quote(OTHER_ID)}, {sql_quote(OTHER_ID)},
   jsonb_build_object('sub', {sql_quote(OTHER_ID)}, 'email', {sql_quote(OTHER_EMAIL)}),
   'email', now(), now(), now());
INSERT INTO public.routes (id, user_id, wall_id, name, grade_v, holds, is_public)
VALUES
  ({sql_quote(OWNER_ROUTE_ID)}, {sql_quote(OWNER_ID)}, 'rls-harness-wall', {sql_quote(ROUTE_MARKER + 'owner')}, 'VB', '[]'::jsonb, true),
  ({sql_quote(PROTECTED_ROUTE_ID)}, {sql_quote(OWNER_ID)}, 'rls-harness-wall', {sql_quote(ROUTE_MARKER + 'protected')}, 'V1', '[]'::jsonb, true),
  ({sql_quote(NULL_OWNER_ROUTE_ID)}, NULL, 'rls-harness-wall', {sql_quote(ROUTE_MARKER + 'null-owner')}, 'V0', '[]'::jsonb, true);
COMMIT;
"""
    run_psql(sql)


def cleanup_fixtures() -> None:
    user_ids = ", ".join(sql_quote(user_id) for user_id in (OWNER_ID, OTHER_ID))
    route_ids = ", ".join(
        sql_quote(route_id)
        for route_id in (OWNER_ROUTE_ID, PROTECTED_ROUTE_ID, NULL_OWNER_ROUTE_ID, INSERTED_ROUTE_ID)
    )
    emails = ", ".join(sql_quote(email) for email in (OWNER_EMAIL, OTHER_EMAIL))
    run_psql(
        f"DELETE FROM public.routes WHERE id IN ({route_ids}) AND position({sql_quote(ROUTE_MARKER)} IN name) = 1;"
        f" DELETE FROM auth.users WHERE id IN ({user_ids}) AND email IN ({emails});"
    )
    remaining = run_psql(
        f"SELECT count(*) FROM public.routes WHERE id IN ({route_ids});"
        f" SELECT count(*) FROM auth.users WHERE id IN ({user_ids});"
    ).splitlines()
    if remaining != ["0", "0"]:
        fail(f"fixture cleanup incomplete; remaining fixed-ID rows: {remaining!r}")


def get_route(base: str, route_id: str, token: str | None = None) -> dict | None:
    result = expect_api_result(
        request_json(
            "GET",
            f"{base}/rest/v1/routes?id=eq.{route_id}&select=id,user_id,name,grade_v,holds,wall_image_width,wall_image_height",
            token,
        ),
        f"read route {route_id}",
    )
    if result.status != 200 or not isinstance(result.body, list):
        fail(f"read route {route_id} failed: HTTP {result.status} {result.body!r}")
    return result.body[0] if result.body else None


def insert_owner_route(base: str, token: str) -> dict:
    width = 1600
    height = 900
    result = expect_api_result(
        request_json(
            "POST",
            f"{base}/rest/v1/routes?select=id,user_id,name,wall_image_width,wall_image_height",
            token,
            {
                "id": INSERTED_ROUTE_ID,
                "user_id": OWNER_ID,
                "wall_id": "rls-harness-wall",
                "name": ROUTE_MARKER + "inserted",
                "grade_v": "V3",
                "holds": [],
                "is_public": True,
                "wall_image_width": width,
                "wall_image_height": height,
            },
        ),
        "owner route insert",
    )
    if result.status not in {200, 201} or not isinstance(result.body, list) or len(result.body) != 1:
        fail(f"owner route insert failed: HTTP {result.status} {result.body!r}")
    inserted = result.body[0]
    if not isinstance(inserted, dict):
        fail(f"owner route insert returned unexpected body: {result.body!r}")
    if (
        inserted.get("id") != INSERTED_ROUTE_ID
        or inserted.get("user_id") != OWNER_ID
        or inserted.get("wall_image_width") != width
        or inserted.get("wall_image_height") != height
    ):
        fail(f"owner route insert returned unexpected dimensions: {inserted!r}")
    return inserted


def assert_update(base: str, route_id: str, token: str, name: str, expected_count: int, description: str) -> None:
    result = expect_api_result(
        request_json(
            "PATCH",
            f"{base}/rest/v1/routes?id=eq.{route_id}",
            token,
            {"name": name, "grade_v": "V2"},
        ),
        description,
    )
    if result.status != 200 or not isinstance(result.body, list) or len(result.body) != expected_count:
        fail(f"{description}: expected {expected_count} affected row(s), HTTP {result.status} {result.body!r}")


def assert_delete(base: str, route_id: str, token: str, expected_count: int, description: str) -> None:
    result = expect_api_result(
        request_json(
            "DELETE",
            f"{base}/rest/v1/routes?id=eq.{route_id}",
            token,
            None,
        ),
        description,
    )
    if result.status not in {200, 204}:
        fail(f"{description}: unexpected HTTP {result.status} {result.body!r}")
    if expected_count == 1 and get_route(base, route_id) is not None:
        fail(f"{description}: owner delete returned success but the row remains")
    if expected_count == 0 and get_route(base, route_id) is None:
        fail(f"{description}: rejected delete removed the row")


def run() -> None:
    base = os.environ.get(LOCAL_URL_ENV, DEFAULT_LOCAL_URL).rstrip("/")
    ensure_backend(base)
    run_psql("SELECT 1;")
    try:
        setup_fixtures()
        owner = login(base, User(OWNER_ID, OWNER_EMAIL))
        other = login(base, User(OTHER_ID, OTHER_EMAIL))
        inserted = insert_owner_route(base, owner)
        inserted_read = get_route(base, INSERTED_ROUTE_ID, owner)
        if (
            not inserted_read
            or inserted_read.get("wall_image_width") != inserted["wall_image_width"]
            or inserted_read.get("wall_image_height") != inserted["wall_image_height"]
        ):
            fail(f"owner route read did not preserve inserted dimensions: {inserted_read!r}")
        assert_storage_ownership(base, owner, other)

        assert_update(
            base,
            OWNER_ROUTE_ID,
            owner,
            ROUTE_MARKER + "owner-updated",
            1,
            "owner update",
        )
        updated = get_route(base, OWNER_ROUTE_ID)
        if not updated or updated["name"] != ROUTE_MARKER + "owner-updated" or updated["grade_v"] != "V2":
            fail(f"owner update did not persist expected values: {updated!r}")

        original_protected = get_route(base, PROTECTED_ROUTE_ID)
        if not original_protected:
            fail("protected route fixture is missing")
        assert_update(
            base,
            PROTECTED_ROUTE_ID,
            other,
            ROUTE_MARKER + "non-owner-update",
            0,
            "non-owner update rejection",
        )
        if get_route(base, PROTECTED_ROUTE_ID) != original_protected:
            fail("non-owner update changed the protected row")

        assert_delete(base, PROTECTED_ROUTE_ID, other, 0, "non-owner delete rejection")
        if get_route(base, PROTECTED_ROUTE_ID) != original_protected:
            fail("non-owner delete changed the protected row")

        original_null = get_route(base, NULL_OWNER_ROUTE_ID)
        if not original_null:
            fail("NULL-owner route fixture is missing")
        assert_update(
            base,
            NULL_OWNER_ROUTE_ID,
            owner,
            ROUTE_MARKER + "null-owner-update",
            0,
            "NULL user_id update rejection",
        )
        if get_route(base, NULL_OWNER_ROUTE_ID) != original_null:
            fail("update against NULL user_id changed the row")

        assert_delete(base, NULL_OWNER_ROUTE_ID, owner, 0, "NULL user_id delete rejection")
        if get_route(base, NULL_OWNER_ROUTE_ID) != original_null:
            fail("delete against NULL user_id changed the row")

        assert_delete(base, OWNER_ROUTE_ID, owner, 1, "owner delete")
        if get_route(base, PROTECTED_ROUTE_ID) is None or get_route(base, NULL_OWNER_ROUTE_ID) is None:
            fail("a rejected mutation did not preserve its route")
        print("PASS: owner update/delete succeeded; non-owner and NULL user_id mutations were rejected with rows preserved")
    finally:
        cleanup_fixtures()
        print("PASS: fixed UUID auth users and route fixtures cleaned up")


def main() -> int:
    try:
        run()
    except HarnessError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"FAIL: unexpected harness error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
