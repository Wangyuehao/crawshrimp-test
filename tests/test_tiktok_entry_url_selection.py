import unittest

from core import api_server


class TiktokEntryUrlSelectionTests(unittest.TestCase):
    def test_product_rating_new_page_uses_selected_eu_region_url(self):
        selected = api_server._resolve_task_target_entry_url(
            "tiktok-ops-assistant",
            "product_rating",
            {"shop_regions": ["FR"]},
            "https://seller.us.tiktokshopglobalselling.com/product/rating",
        )

        self.assertEqual(
            selected,
            "https://seller.eu.tiktokshopglobalselling.com/product/rating?shop_region=FR",
        )

    def test_product_rating_new_page_uses_selected_us_region_url(self):
        selected = api_server._resolve_task_target_entry_url(
            "tiktok-ops-assistant",
            "product_rating",
            {"shop_regions": ["US"]},
            "https://seller.us.tiktokshopglobalselling.com/product/rating",
        )

        self.assertEqual(
            selected,
            "https://seller.us.tiktokshopglobalselling.com/product/rating?shop_region=US",
        )

    def test_creator_video_download_new_page_uses_affiliate_region_url(self):
        selected = api_server._resolve_task_target_entry_url(
            "tiktok-ops-assistant",
            "creator_video_download",
            {"shop_regions": ["FR"]},
            "https://affiliate.tiktokshopglobalselling.com/insights/transaction-analysis",
        )

        self.assertEqual(
            selected,
            "https://affiliate.tiktokshopglobalselling.com/insights/transaction-analysis?shop_region=FR",
        )


if __name__ == "__main__":
    unittest.main()
