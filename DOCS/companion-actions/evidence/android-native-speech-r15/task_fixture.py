"""Create one task in the named local native test database."""
import json
import re
import subprocess
import uuid


def command(project):
    if not re.fullmatch(r"unify-native-speech-374-r15", project):
        raise ValueError("The project must be the owned R8 project")
    return ["docker", "exec", "-i", "supabase_db_" + project,
            "psql", "-U", "postgres", "-d", "postgres",
            "-v", "ON_ERROR_STOP=1", "-X", "-q", "-A", "-t"]


def statement(account_id):
    owner = str(uuid.UUID(account_id))
    return (
        "insert into public.custom_checklist_tasks "
        "(id,user_id,priority,title,description) values "
        "(3698001,'" + owner + "','Do now','Native R8 reminder',"
        "'Owned synthetic native reminder task') "
        "returning json_build_object('id',id,'completed',completed,"
        "'revision',revision,'removed',removed_at);\n"
    )


def parse_row(raw):
    row = json.loads(raw)
    if not isinstance(row, dict) or set(row) != {"id", "completed", "revision", "removed"}:
        raise ValueError("Expected one complete task row")
    if type(row["id"]) is not int or row["id"] != 3698001:
        raise ValueError("Unexpected task identity")
    if type(row["revision"]) is not int or row["revision"] != 1:
        raise ValueError("Unexpected initial revision")
    if row["completed"] is not False or row["removed"] is not None:
        raise ValueError("Unexpected initial task state")
    return row


def create(project, account_id, execute=subprocess.run):
    result = execute(command(project), input=statement(account_id).encode(),
                     capture_output=True, timeout=30)
    if result.returncode:
        # Do not include local credentials or query text in the exception.
        raise RuntimeError("The owned task fixture SQL failed")
    return parse_row(result.stdout)
