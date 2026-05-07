import asyncio
import unittest
from pathlib import Path
import tempfile
from unittest.mock import AsyncMock, patch

from core import api_server


class ApiTaskLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_task_background_marks_early_crash_as_error_and_clears_control(self):
        jid = "temu::tax_free_return_confirm"
        original_status = dict(api_server._run_status)
        original_logs = dict(api_server._run_logs)
        original_controls = dict(api_server._run_controls)

        run_control = api_server._build_run_control()
        run_control["task"] = asyncio.current_task()

        try:
            api_server._run_status[jid] = {"status": "running", "run_id": None, "records": 0}
            api_server._run_logs[jid] = []
            api_server._run_controls[jid] = run_control

            with patch(
                "core.api_server._execute_task",
                new=AsyncMock(side_effect=RuntimeError("boom before begin_run")),
            ):
                await api_server._run_task_background(
                    "temu",
                    "tax_free_return_confirm",
                    {},
                    {},
                    run_control,
                )

            self.assertEqual(api_server._run_status[jid]["status"], "error")
            self.assertIsNone(api_server._run_status[jid]["run_id"])
            self.assertEqual(api_server._run_status[jid]["records"], 0)
            self.assertIn("boom before begin_run", api_server._run_status[jid]["error"])
            self.assertNotIn(jid, api_server._run_controls)
            self.assertTrue(any("FATAL" in line for line in api_server._run_logs[jid]))
        finally:
            api_server._run_status.clear()
            api_server._run_status.update(original_status)
            api_server._run_logs.clear()
            api_server._run_logs.update(original_logs)
            api_server._run_controls.clear()
            api_server._run_controls.update(original_controls)

    async def test_tmall_buyer_reviews_navigates_to_each_item_url_between_runs(self):
        class FakeBridge:
            def get_tabs(self):
                return []

            def new_tab(self, url):
                return {"id": "tab-1", "url": url, "webSocketDebuggerUrl": "ws://example.invalid"}

            def find_tab(self, url):
                return {"id": "tab-1", "url": url, "webSocketDebuggerUrl": "ws://example.invalid"}

            def get_tab_ws_url(self, tab):
                return "ws://example.invalid"

        class FakeRunner:
            def __init__(self, *args, **kwargs):
                self.navigations = []
                self.runtime_output_files = []

            async def evaluate(self, expression):
                return type("Result", (), {"success": True, "data": [], "meta": {"logged_in": True}, "error": None})()

            async def navigate(self, url, wait_seconds=0):
                self.navigations.append(str(url))
                return type("Result", (), {"success": True, "data": [], "meta": {"has_more": False}, "error": None})()

            async def run_script_file(self, script_path, params=None, control_hook=None):
                return [{
                    "商品ID": params["item_links"].split("id=")[1].split("&")[0],
                    "执行结果": "成功",
                }]

        jid = "tmall-ops-assistant::buyer_reviews"
        original_status = dict(api_server._run_status)
        original_logs = dict(api_server._run_logs)
        original_controls = dict(api_server._run_controls)

        fake_runner = FakeRunner()
        run_control = api_server._build_run_control()
        run_control["task"] = asyncio.current_task()

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                adapter_dir = Path(tmpdir)
                (adapter_dir / "auth_check.js").write_text("({ success: true, data: [], meta: { logged_in: true, has_more: false } })", encoding="utf-8")
                (adapter_dir / "buyer-reviews.js").write_text("({ success: true, data: [], meta: { has_more: false } })", encoding="utf-8")

                class FakeTask:
                    id = "buyer_reviews"
                    name = "买家评价抓取"
                    description = ""
                    entry_url = "https://detail.tmall.com/item.htm"
                    tab_match_prefixes = []
                    output = []
                    script = "buyer-reviews.js"
                    skip_auth = False
                    params = [
                        type("Param", (), {"id": "item_links", "default": None})(),
                        type("Param", (), {"id": "page_size", "default": "20"})(),
                        type("Param", (), {"id": "max_pages", "default": 30})(),
                    ]

                class FakeAdapter:
                    id = "tmall-ops-assistant"
                    name = "天猫运营助手"
                    entry_url = "https://detail.tmall.com/item.htm"
                    tab_match_prefixes = []
                    tasks = [FakeTask()]
                    auth = type("Auth", (), {"check_script": "auth_check.js", "login_url": "https://login.taobao.com/member/login.jhtml"})()

                with patch("core.api_server.adapter_loader.scan_all"):
                    with patch("core.api_server.adapter_loader.get_adapter", return_value=FakeAdapter()):
                        with patch("core.api_server.get_bridge", return_value=FakeBridge()):
                            with patch("core.js_runner.JSRunner", return_value=fake_runner):
                                with patch("core.api_server.data_sink.begin_run", return_value=999):
                                    with patch("core.api_server.data_sink.prepare_artifact_dir", return_value="/tmp"):
                                        with patch("core.api_server.data_sink.finish_run"):
                                            with patch("core.api_server.adapter_loader.get_adapter_dir", return_value=adapter_dir):
                                                await api_server._execute_task(
                                                    "tmall-ops-assistant",
                                                    "buyer_reviews",
                                                    {
                                                        "item_links": "、".join([
                                                            "https://detail.tmall.com/item.htm?id=919643072179&skuId=5789814873879",
                                                            "https://detail.tmall.com/item.htm?id=1023254962064&skuId=6034929285662",
                                                            "https://detail.tmall.com/item.htm?id=732533512173&skuId=6038497472965",
                                                        ]),
                                                    },
                                                    {},
                                                    run_control=run_control,
                                                )

            self.assertGreaterEqual(len(fake_runner.navigations), 3)
            self.assertEqual(
                fake_runner.navigations[-3:],
                [
                    "https://detail.tmall.com/item.htm?id=919643072179&skuId=5789814873879",
                    "https://detail.tmall.com/item.htm?id=1023254962064&skuId=6034929285662",
                    "https://detail.tmall.com/item.htm?id=732533512173&skuId=6038497472965",
                ],
            )
        finally:
            api_server._run_status.clear()
            api_server._run_status.update(original_status)
            api_server._run_logs.clear()
            api_server._run_logs.update(original_logs)
            api_server._run_controls.clear()
            api_server._run_controls.update(original_controls)


if __name__ == "__main__":
    unittest.main()
