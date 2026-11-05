"""Load the plugin under a private package name so it does not clash with Hermes."""

from __future__ import annotations

import copy
import importlib.machinery
import importlib.util
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = "agentpurse_plugin"


def _parent():
    if PKG in sys.modules:
        return sys.modules[PKG]
    package = types.ModuleType(PKG)
    package.__path__ = [str(ROOT)]
    package.__package__ = PKG
    sys.modules[PKG] = package
    return package


def load(name: str):
    _parent()
    qual = f"{PKG}.{name}"
    if qual in sys.modules:
        return sys.modules[qual]
    loader = importlib.machinery.SourceFileLoader(qual, str(ROOT / f"{name}.py"))
    spec = importlib.util.spec_from_loader(qual, loader)
    module = importlib.util.module_from_spec(spec)
    module.__package__ = PKG
    sys.modules[qual] = module
    loader.exec_module(module)
    return module


def load_plugin():
    package = _parent()
    if getattr(package, "register", None):
        return package
    package.__file__ = str(ROOT / "__init__.py")
    loader = importlib.machinery.SourceFileLoader(PKG, str(ROOT / "__init__.py"))
    loader.exec_module(package)
    return package


class MemoryState:
    def __init__(self):
        self.data = {}

    def get(self, key, default=None):
        if key not in self.data:
            return copy.deepcopy(default)
        return copy.deepcopy(self.data[key])

    def set(self, key, value):
        self.data[key] = copy.deepcopy(value)


class FakeCtx:
    def __init__(self, config=None):
        self.state = MemoryState()
        self.config = dict(config or {})
        self.tools = []
        self.hooks = []
        self.commands = []
        self.skills = []

    def get_config(self, key, default=None):
        return self.config.get(key, default)

    def register_tool(self, **kwargs):
        self.tools.append(kwargs)

    def register_hook(self, name, callback, **kwargs):
        self.hooks.append((name, callback, kwargs))

    def register_command(self, name, handler, **kwargs):
        self.commands.append((name, handler, kwargs))

    def register_skill(self, name, path):
        self.skills.append((name, path))


class Clock:
    def __init__(self):
        self.now = 0.0
        self.slept = 0.0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.slept += seconds
        self.now += seconds


ATTENDED = {"HERMES_INTERACTIVE": "1"}
