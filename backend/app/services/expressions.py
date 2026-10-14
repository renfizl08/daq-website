import ast
import re
from collections.abc import Callable

import numpy as np
import pandas as pd

from app.core.errors import bad_request

_BACKTICKED = re.compile(r"`([^`]+)`")
_BINARY_OPS: dict[type[ast.operator], Callable] = {
    ast.Add: np.add,
    ast.Sub: np.subtract,
    ast.Mult: np.multiply,
    ast.Div: np.divide,
}
_FUNCTIONS = {"abs": np.abs, "sqrt": np.sqrt}


def parse_expression(expression: str) -> tuple[ast.expr, dict[str, str]]:
    """Parse an arithmetic expression. Columns are bare names or `backticked`.

    Returns the AST and a map of identifier -> dataset column name.
    """
    columns: dict[str, str] = {}

    def placeholder(match: re.Match) -> str:
        name = f"_col{len(columns)}"
        columns[name] = match.group(1)
        return name

    try:
        tree = ast.parse(_BACKTICKED.sub(placeholder, expression), mode="eval").body
    except SyntaxError as exc:
        raise bad_request(f"Invalid expression '{expression}'") from exc
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id not in columns:
            if node.id not in _FUNCTIONS:
                columns[node.id] = node.id
    return tree, columns


def _evaluate(node: ast.expr, frame: pd.DataFrame, columns: dict[str, str]):
    if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
        return node.value
    if isinstance(node, ast.Name):
        series = frame[columns[node.id]]
        if not pd.api.types.is_numeric_dtype(series):
            raise bad_request(f"Column '{columns[node.id]}' is not numeric")
        return series.to_numpy(dtype=float)
    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY_OPS:
        return _BINARY_OPS[type(node.op)](
            _evaluate(node.left, frame, columns),
            _evaluate(node.right, frame, columns),
        )
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub | ast.UAdd):
        value = _evaluate(node.operand, frame, columns)
        return -value if isinstance(node.op, ast.USub) else value
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in _FUNCTIONS
        and len(node.args) == 1
        and not node.keywords
    ):
        return _FUNCTIONS[node.func.id](_evaluate(node.args[0], frame, columns))
    raise bad_request("Expressions support only numbers, columns, + - * /, abs, sqrt")


def add_computed_columns(
    frame: pd.DataFrame, computed: list[tuple[str, ast.expr, dict[str, str]]]
) -> pd.DataFrame:
    """Return frame with each (name, tree, columns) evaluated as a new column."""
    frame = frame.copy(deep=False)
    for name, tree, columns in computed:
        missing = sorted({c for c in columns.values() if c not in frame.columns})
        if missing:
            raise bad_request(f"Unknown dataset columns: {', '.join(missing)}")
        with np.errstate(divide="ignore", invalid="ignore"):
            result = _evaluate(tree, frame, columns)
        values = np.broadcast_to(np.asarray(result, dtype=float), (len(frame),))
        frame[name] = np.where(np.isfinite(values), values, np.nan)
    return frame
