/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.googleapis.services.AbstractGoogleClientRequest;
import com.google.api.client.http.HttpRequestInitializer;
import com.google.api.services.bigquery.Bigquery;
import com.google.api.services.bigquery.Bigquery.Datasets;
import com.google.api.services.bigquery.Bigquery.Tables;
import com.google.api.services.bigquery.model.Dataset;
import com.google.api.services.bigquery.model.DatasetReference;
import com.google.api.services.bigquery.model.Table;
import com.google.api.services.bigquery.model.TableReference;
import com.google.api.services.bigquery.model.TableSchema;
import com.google.api.services.pubsub.Pubsub;
import com.google.api.services.pubsub.model.Subscription;
import com.google.api.services.pubsub.model.Topic;
import com.google.auth.Credentials;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.cloud.hadoop.util.ChainingHttpRequestInitializer;
import com.google.common.collect.ImmutableList;
import com.google.common.collect.Lists;
import com.google.common.collect.Sets;
import com.google.common.util.concurrent.Uninterruptibles;
import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.apache.beam.sdk.PipelineResult;
import org.apache.beam.sdk.extensions.gcp.auth.NullCredentialInitializer;
import org.apache.beam.sdk.io.gcp.bigquery.BigQueryOptions;
import org.apache.beam.sdk.io.gcp.pubsub.PubsubOptions;
import org.apache.beam.sdk.options.PipelineOptions;
import org.apache.beam.sdk.util.BackOff;
import org.apache.beam.sdk.util.BackOffUtils;
import org.apache.beam.sdk.util.FluentBackoff;
import org.apache.beam.sdk.util.RetryHttpRequestInitializer;
import org.apache.beam.sdk.util.Sleeper;
import org.apache.beam.sdk.util.Transport;
import org.joda.time.Duration;

/**
 * The utility class that sets up and tears down external resources,
 * and cancels the streaming pipelines once the program terminates.
 *
 * <p>It is used to run Beam examples.
 */
public class ExampleUtils {

    private static final int SC_NOT_FOUND = 404;

    /**
     * \p{L} denotes the category of Unicode letters,
     * so this pattern will match on everything that is not a letter.
     *
     * <p>It is used for tokenizing strings in the wordcount examples.
     */
    public static final String TOKENIZER_PATTERN = "[^\\p{L}]+";

    private final PipelineOptions options;
    private Bigquery bigQueryClient = null;
    private Pubsub pubsubClient = null;
    private Set<PipelineResult> pipelinesToCancel = Sets.newHashSet();
    private List<String> pendingMessages = Lists.newArrayList();

    /**
     * Do resources and runner options setup.
     */
    public ExampleUtils(PipelineOptions options) {
        this.options = options;
    }

    /**
     * Sets up external resources that are required by the example,
     * such as Pub/Sub topics and BigQuery tables.
     *
     * @throws IOException if there is a problem setting up the resources
     */

    /**
     * Sets up the Google Cloud Pub/Sub topic.
     *
     * <p>If the topic doesn't exist, a new topic with the given name will be created.
     *
     * @throws IOException if there is a problem setting up the Pub/Sub topic
     */

    /**
     * Sets up the BigQuery table with the given schema.
     *
     * <p>If the table already exists, the schema has to match the given one. Otherwise, the example
     * will throw a RuntimeException. If the table doesn't exist, a new table with the given schema
     * will be created.
     *
     * @throws IOException if there is a problem setting up the BigQuery table
     * Returns a BigQuery client builder using the specified {@link BigQueryOptions}.
     */
    private static Bigquery.Builder newBigQueryClient(BigQueryOptions options) {
        return new Bigquery.Builder(Transport.getTransport(), Transport.getJsonFactory(),
                chainHttpRequestInitializer(
                        options.getGcpCredential(),
                        // Do not log 404. It clutters the output and is possibly even required by the caller.
                        new RetryHttpRequestInitializer(ImmutableList.of(404))))
                .setApplicationName(options.getAppName())
                .setGoogleClientRequestInitializer(options.getGoogleApiTrace());
    }

    /**
     * Returns a Pubsub client builder using the specified {@link PubsubOptions}.
     */
    private static Pubsub.Builder newPubsubClient(PubsubOptions options) {
        return new Pubsub.Builder(Transport.getTransport(), Transport.getJsonFactory(),
                chainHttpRequestInitializer(
                        options.getGcpCredential(),
                        // Do not log 404. It clutters the output and is possibly even required by the caller.
                        new RetryHttpRequestInitializer(ImmutableList.of(404))))
                .setRootUrl(options.getPubsubRootUrl())
                .setApplicationName(options.getAppName())
                .setGoogleClientRequestInitializer(options.getGoogleApiTrace());
    }

    private static HttpRequestInitializer chainHttpRequestInitializer(
            Credentials credential, HttpRequestInitializer httpRequestInitializer) {
        if (credential == null) {
            return new ChainingHttpRequestInitializer(
                    new NullCredentialInitializer(), httpRequestInitializer);
        } else {
            return new ChainingHttpRequestInitializer(
                    new HttpCredentialsAdapter(credential),
                    httpRequestInitializer);
        }
    }

    private void setupBigQueryTable(String projectId, String datasetId, String tableId,
                                    TableSchema schema) throws IOException {
        if (bigQueryClient == null) {
            bigQueryClient = newBigQueryClient(options.as(BigQueryOptions.class)).build();
        }

        Datasets datasetService = bigQueryClient.datasets();
        if (executeNullIfNotFound(datasetService.get(projectId, datasetId)) == null) {
            Dataset newDataset = new Dataset().setDatasetReference(
                    new DatasetReference().setProjectId(projectId).setDatasetId(datasetId));
            datasetService.insert(projectId, newDataset).execute();
        }

        Tables tableService = bigQueryClient.tables();
        Table table = executeNullIfNotFound(tableService.get(projectId, datasetId, tableId));
        if (table == null) {
            Table newTable = new Table().setSchema(schema).setTableReference(
                    new TableReference().setProjectId(projectId).setDatasetId(datasetId).setTableId(tableId));
            tableService.insert(projectId, datasetId, newTable).execute();
        } else if (!table.getSchema().equals(schema)) {
            throw new RuntimeException(
                    "Table exists and schemas do not match, expecting: " + schema.toPrettyString()
                            + ", actual: " + table.getSchema().toPrettyString());
        }
    }

    private void setupPubsubTopic(String topic) throws IOException {
        if (pubsubClient == null) {
            pubsubClient = newPubsubClient(options.as(PubsubOptions.class)).build();
        }
        if (executeNullIfNotFound(pubsubClient.projects().topics().get(topic)) == null) {
            pubsubClient.projects().topics().create(topic, new Topic().setName(topic)).execute();
        }
    }

    private void setupPubsubSubscription(String topic, String subscription) throws IOException {
        if (pubsubClient == null) {
            pubsubClient = newPubsubClient(options.as(PubsubOptions.class)).build();
        }
        if (executeNullIfNotFound(pubsubClient.projects().subscriptions().get(subscription)) == null) {
            Subscription subInfo = new Subscription()
                    .setAckDeadlineSeconds(60)
                    .setTopic(topic);
            pubsubClient.projects().subscriptions().create(subscription, subInfo).execute();
        }
    }

    /**
     * Deletes the Google Cloud Pub/Sub topic.
     *
     * @throws IOException if there is a problem deleting the Pub/Sub topic
     */
    private void deletePubsubTopic(String topic) throws IOException {
        if (pubsubClient == null) {
            pubsubClient = newPubsubClient(options.as(PubsubOptions.class)).build();
        }
        if (executeNullIfNotFound(pubsubClient.projects().topics().get(topic)) != null) {
            pubsubClient.projects().topics().delete(topic).execute();
        }
    }

    /**
     * Deletes the Google Cloud Pub/Sub subscription.
     *
     * @throws IOException if there is a problem deleting the Pub/Sub subscription
     */
    private void deletePubsubSubscription(String subscription) throws IOException {
        if (pubsubClient == null) {
            pubsubClient = newPubsubClient(options.as(PubsubOptions.class)).build();
        }
        if (executeNullIfNotFound(pubsubClient.projects().subscriptions().get(subscription)) != null) {
            pubsubClient.projects().subscriptions().delete(subscription).execute();
        }
    }

    private void printPendingMessages() {
        System.out.println();
        System.out.println("***********************************************************");
        System.out.println("***********************************************************");
        for (String message : pendingMessages) {
            System.out.println(message);
        }
        System.out.println("***********************************************************");
        System.out.println("***********************************************************");
    }

    private static <T> T executeNullIfNotFound(
            AbstractGoogleClientRequest<T> request) throws IOException {
        try {
            return request.execute();
        } catch (GoogleJsonResponseException e) {
            if (e.getStatusCode() == SC_NOT_FOUND) {
                return null;
            } else {
                throw e;
            }
        }
    }
}
