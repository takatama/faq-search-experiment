// File IDs only. No API keys or OAuth credentials.
function runInitialBenchmark() {
  PropertiesService.getScriptProperties().setProperties({
    FAQ_DIMENSIONS: "768",
    FAQ_INDEX_768_FILE_ID: "1s44YtK63mWEUOXBTYvXbPsSCaCzdynV2",
    FAQ_DEV_768_FILE_ID: "14UL6wDd_fLMjySF1M7_HMDcJyJOTD9hA",
  });
  return benchmarkFaq();
}
