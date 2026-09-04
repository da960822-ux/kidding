import asyncio
import unittest
from time import monotonic

from fastapi import Response
from app.ai import request_deadline
from app.main import security_headers


class RequestBudgetTests(unittest.IsolatedAsyncioTestCase):
    async def test_each_request_gets_its_own_deadline_and_resets_after_failure(self):
        original = request_deadline.get()
        deadlines = []

        async def next_response(_request):
            deadlines.append(request_deadline.get())
            await asyncio.sleep(0)
            return Response()

        async def failure(_request):
            deadlines.append(request_deadline.get())
            raise RuntimeError("fixture")

        before = monotonic()
        await security_headers(None, next_response)
        with self.assertRaises(RuntimeError):
            await security_headers(None, failure)
        self.assertEqual(request_deadline.get(), original)
        self.assertTrue(all(value is not None and before < value <= monotonic() + 50 for value in deadlines))
