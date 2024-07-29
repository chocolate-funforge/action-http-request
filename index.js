// @ts-check
import {
  getInput,
  getMultilineInput,
  getBooleanInput,
  info,
  warning,
  setFailed,
  setOutput
} from '@actions/core';
// import { HttpClient } from '@actions/http-client';
import { delay } from './utils/promise';
import { toJson } from './utils/json';
import fetch from 'node-fetch';

const main = async () => {
  // Get the inputs
  const inputs = {
    url: getInput('url'),
    method: getInput('method'),
    headers: Object.fromEntries(
      // Turn the array of string headers into an array of key-value pairs
      getMultilineInput('headers').map((header) => header.split(':', 2).map((s) => s.trim()))
    ),
    body: getInput('body'),
    retryCount: Number(getInput('retry-count')),
    retryDelay: Number(getInput('retry-delay')),
    failOnError: getBooleanInput('fail-on-error')
  };

  info(`Inputs: ${toJson(inputs)}`);

  let remainingRetryCount = inputs.retryCount;
  while (true) {
    // Make the request
    const response = await fetch(inputs.url, {
      method: inputs.method,
      headers: inputs.headers,
      body: inputs.body
    });
    const responseSuccess = response.status && response.status < 400;

    // Check for errors
    if (!responseSuccess) {
      // Retry if possible
      if (remainingRetryCount > 0) {
        warning(
          `Request failed with status code ${response.status}. Retries remaining: ${remainingRetryCount}.`
        );

        if (inputs.retryDelay > 0) {
          info(`Delaying for ${inputs.retryDelay}ms...`);
          await delay(inputs.retryDelay);
        }

        remainingRetryCount--;
        continue;
      }
      // Otherwise, fail or warn about the error
      else {
        if (inputs.failOnError) {
          setFailed(`Request failed with status code ${response.status}. No retries remaining.`);
        } else {
          warning(`Request failed with status code ${response.status}. No retries remaining.`);
        }
      }
    }

    // Read the body
    const responseBody = await response.text();

    // Set the outputs
    const outputs = {
      status: response.status,
      success: responseSuccess,
      headers: response.headers,
      body: responseBody
    };

    // we need id to deploy the deployment to a customized host, if you don't need to, ignore this
    let id = '';
    try {
      const parsedBody = JSON.parse(responseBody);
      id = parsedBody.id;
    } catch (ignored) {
      console.warn('Failed to parse response body as JSON:', responseBody);
    }

    info(`Outputs: ${toJson(outputs)}`);

    setOutput('status', outputs.status);
    setOutput('success', outputs.success);
    setOutput('headers', toJson(outputs.headers));
    setOutput('body', outputs.body);
    setOutput('id', id);

    // Break out of the retry loop
    break;
  }
};

main().catch((error) => setFailed(error));
