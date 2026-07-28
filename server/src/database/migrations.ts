import { aql } from 'arangojs/aql';
import { Database } from 'arangojs';
import { arangoCollections } from './arango.js';

interface DatabaseMigrationRecord {
  _key: string;
  id: string;
  name: string;
  appliedAt: string;
  durationMs: number;
}

interface ArangoMigration {
  id: string;
  name: string;
  up: (database: Database) => Promise<void>;
}

const migrations: ArangoMigration[] = [
  {
    id: '202607260001_conversation_rating_fields',
    name: 'Backfill conversation rating fields',
    async up(database) {
      const conversations = database.collection(arangoCollections.conversations);
      await database.query(aql`
        FOR conversation IN ${conversations}
          FILTER !HAS(conversation, "rating") OR !HAS(conversation, "ratingSubmittedAt")
          UPDATE conversation WITH {
            rating: HAS(conversation, "rating") ? conversation.rating : null,
            ratingSubmittedAt: HAS(conversation, "ratingSubmittedAt") ? conversation.ratingSubmittedAt : null
          } IN ${conversations}
      `);
    }
  },
  {
    id: '202607260002_diagnostic_tracking_fields',
    name: 'Backfill diagnostic case tracking and feedback fields',
    async up(database) {
      const diagnosticCases = database.collection(arangoCollections.diagnosticCases);
      await database.query(aql`
        FOR item IN ${diagnosticCases}
          FILTER !HAS(item, "similarIssueCount")
            OR !HAS(item, "similarUserCount")
            OR !HAS(item, "duplicateOfDiagnosticId")
            OR !HAS(item, "duplicateNotice")
            OR !HAS(item, "rating")
            OR !HAS(item, "ratingComment")
            OR !HAS(item, "ratingSubmittedAt")
          UPDATE item WITH {
            similarIssueCount: HAS(item, "similarIssueCount") ? item.similarIssueCount : 1,
            similarUserCount: HAS(item, "similarUserCount") ? item.similarUserCount : 1,
            duplicateOfDiagnosticId: HAS(item, "duplicateOfDiagnosticId") ? item.duplicateOfDiagnosticId : null,
            duplicateNotice: HAS(item, "duplicateNotice") ? item.duplicateNotice : "",
            rating: HAS(item, "rating") ? item.rating : null,
            ratingComment: HAS(item, "ratingComment") ? item.ratingComment : "",
            ratingSubmittedAt: HAS(item, "ratingSubmittedAt") ? item.ratingSubmittedAt : null
          } IN ${diagnosticCases}
      `);
    }
  },
  {
    id: '202607260003_ticket_service_settings_shape',
    name: 'Normalize ticket service settings document',
    async up(database) {
      const settings = database.collection(arangoCollections.settings);
      await database.query(aql`
        UPSERT { _key: "ticket_service" }
          INSERT {
            _key: "ticket_service",
            url: "",
            authorizationHeader: "",
            authHeader: "",
            raiseOnBehalfOf: "",
            serviceDeskId: "",
            requestTypeId: "",
            requestTypeMappings: [],
            updatedAt: null
          }
          UPDATE {
            url: HAS(OLD, "url") ? OLD.url : "",
            authorizationHeader: HAS(OLD, "authorizationHeader") ? OLD.authorizationHeader : "",
            authHeader: HAS(OLD, "authHeader") ? OLD.authHeader : "",
            raiseOnBehalfOf: HAS(OLD, "raiseOnBehalfOf") ? OLD.raiseOnBehalfOf : "",
            serviceDeskId: HAS(OLD, "serviceDeskId") ? OLD.serviceDeskId : "",
            requestTypeId: HAS(OLD, "requestTypeId") ? OLD.requestTypeId : "",
            requestTypeMappings: HAS(OLD, "requestTypeMappings") ? OLD.requestTypeMappings : [],
            updatedAt: HAS(OLD, "updatedAt") ? OLD.updatedAt : null
          }
          IN ${settings}
      `);
    }
  },
  {
    id: '202607260004_external_service_defaults',
    name: 'Backfill external service visibility fields',
    async up(database) {
      const services = database.collection(arangoCollections.externalServices);
      await database.query(aql`
        FOR service IN ${services}
          FILTER !HAS(service, "isActive") OR !HAS(service, "showInAssistant")
          UPDATE service WITH {
            isActive: HAS(service, "isActive") ? service.isActive : true,
            showInAssistant: HAS(service, "showInAssistant") ? service.showInAssistant : false
          } IN ${services}
      `);
    }
  }
];

export async function runArangoMigrations(database: Database): Promise<void> {
  const migrationCollection = database.collection<DatabaseMigrationRecord>(
    arangoCollections.databaseMigrations
  );

  for (const migration of migrations) {
    const alreadyApplied = await migrationCollection.documentExists(migration.id);
    if (alreadyApplied) continue;

    const startedAt = Date.now();
    await migration.up(database);
    await migrationCollection.save(
      {
        _key: migration.id,
        id: migration.id,
        name: migration.name,
        appliedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt
      },
      { overwriteMode: 'ignore' }
    );
  }
}
