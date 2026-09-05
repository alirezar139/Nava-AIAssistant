-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `fullName` VARCHAR(150) NOT NULL,
    `role` ENUM('admin', 'user') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `key` VARCHAR(80) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `projects_isActive_updatedAt_idx`(`isActive`, `updatedAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faqs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `question` TEXT NOT NULL,
    `answer` TEXT NOT NULL,
    `category` VARCHAR(120) NOT NULL,
    `keywords` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `faqs_category_idx`(`category`),
    INDEX `faqs_updatedAt_id_idx`(`updatedAt`, `id`),
    INDEX `faqs_category_updatedAt_id_idx`(`category`, `updatedAt`, `id`),
    FULLTEXT INDEX `faqs_question_answer_category_keywords_idx`(`question`, `answer`, `category`, `keywords`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NOT NULL,
    `matchedFaqId` INTEGER NULL,
    `rating` INTEGER NULL,
    `ratingSubmittedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversations_createdAt_id_idx`(`createdAt`, `id`),
    INDEX `conversations_userId_createdAt_idx`(`userId`, `createdAt`),
    FULLTEXT INDEX `conversations_question_answer_idx`(`question`, `answer`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diagnostic_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `title` VARCHAR(250) NOT NULL,
    `problem` TEXT NOT NULL,
    `systemName` VARCHAR(190) NOT NULL,
    `processName` VARCHAR(190) NOT NULL,
    `scenario` TEXT NOT NULL,
    `serialNumber` VARCHAR(190) NOT NULL,
    `errorText` TEXT NOT NULL,
    `evidence` TEXT NOT NULL,
    `treeNodeId` VARCHAR(190) NOT NULL,
    `treeNodeText` TEXT NOT NULL,
    `status` ENUM('draft', 'analyzed', 'escalated', 'closed') NOT NULL DEFAULT 'draft',
    `analysisSummary` TEXT NULL,
    `severity` ENUM('low', 'medium', 'high') NULL,
    `recommendation` TEXT NULL,
    `externalTicketId` VARCHAR(190) NULL,
    `externalTrackingId` VARCHAR(190) NULL,
    `externalTicketStatus` ENUM('not_configured', 'submitted', 'failed') NULL,
    `externalTicketStatusCode` INTEGER NULL,
    `externalTicketError` TEXT NULL,
    `similarIssueCount` INTEGER NOT NULL DEFAULT 1,
    `similarUserCount` INTEGER NOT NULL DEFAULT 1,
    `duplicateOfDiagnosticId` INTEGER NULL,
    `duplicateNotice` TEXT NULL,
    `rating` INTEGER NULL,
    `ratingComment` TEXT NULL,
    `ratingSubmittedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `analyzedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,

    INDEX `diagnostic_cases_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `diagnostic_cases_treeNodeId_idx`(`treeNodeId`),
    INDEX `diagnostic_cases_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `diagnostic_cases_systemName_processName_idx`(`systemName`, `processName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `external_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(120) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `purpose` TEXT NOT NULL,
    `sectionTitle` VARCHAR(200) NOT NULL,
    `method` ENUM('GET', 'POST', 'PUT', 'PATCH', 'DELETE') NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `authorizationHeader` VARCHAR(255) NULL,
    `authHeader` VARCHAR(255) NULL,
    `headersText` TEXT NULL,
    `bodyTemplate` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `showInAssistant` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `external_services_key_key`(`key`),
    INDEX `external_services_isActive_showInAssistant_idx`(`isActive`, `showInAssistant`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dashboard_metric_logs` (
    `key` ENUM('activeFaqs', 'userRequests', 'engagedUsers', 'faqCoverageRate', 'diagnosticCases', 'treeNodes', 'treeEdges', 'activeServices', 'sahandSubmitted') NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `value` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `source` VARCHAR(40) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dashboard_metric_logs_order_idx`(`order`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_service_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `url` VARCHAR(500) NOT NULL DEFAULT '',
    `authorizationHeader` VARCHAR(255) NULL,
    `authHeader` VARCHAR(255) NULL,
    `raiseOnBehalfOf` VARCHAR(190) NULL,
    `serviceDeskId` VARCHAR(120) NULL,
    `requestTypeId` VARCHAR(120) NULL,
    `updatedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_request_type_mappings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticketServiceSettingsId` INTEGER NOT NULL,
    `nodeId` VARCHAR(190) NOT NULL,
    `nodeLabel` VARCHAR(190) NOT NULL,
    `serviceDeskId` VARCHAR(120) NOT NULL,
    `requestTypeId` VARCHAR(120) NOT NULL,

    UNIQUE INDEX `ticket_request_type_mappings_ticketServiceSettingsId_nodeId_key`(`ticketServiceSettingsId`, `nodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `troubleshooting_tree_settings` (
    `projectKey` VARCHAR(80) NOT NULL,
    `mode` ENUM('active', 'draft') NOT NULL,
    `startNodeId` VARCHAR(190) NOT NULL,
    `introNodeIds` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `nodeCount` INTEGER NOT NULL DEFAULT 0,
    `edgeCount` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,
    `activatedAt` DATETIME(3) NULL,

    PRIMARY KEY (`projectKey`, `mode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `troubleshooting_tree_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectKey` VARCHAR(80) NOT NULL,
    `mode` ENUM('active', 'draft') NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('active', 'draft') NOT NULL,
    `nodeCount` INTEGER NOT NULL,
    `edgeCount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `activatedAt` DATETIME(3) NULL,

    INDEX `troubleshooting_tree_versions_status_updatedAt_idx`(`status`, `updatedAt`),
    UNIQUE INDEX `troubleshooting_tree_versions_projectKey_mode_version_key`(`projectKey`, `mode`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `troubleshooting_nodes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectKey` VARCHAR(80) NOT NULL,
    `treeMode` ENUM('active', 'draft') NOT NULL,
    `nodeId` VARCHAR(190) NOT NULL,
    `text` TEXT NOT NULL,
    `shape` VARCHAR(40) NOT NULL DEFAULT 'process',
    `x` DOUBLE NULL,
    `y` DOUBLE NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `troubleshooting_nodes_projectKey_treeMode_sortOrder_idx`(`projectKey`, `treeMode`, `sortOrder`),
    UNIQUE INDEX `troubleshooting_nodes_projectKey_treeMode_nodeId_key`(`projectKey`, `treeMode`, `nodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `troubleshooting_edges` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectKey` VARCHAR(80) NOT NULL,
    `treeMode` ENUM('active', 'draft') NOT NULL,
    `fromNodeId` INTEGER NOT NULL,
    `toNodeId` INTEGER NOT NULL,
    `label` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `troubleshooting_edges_projectKey_treeMode_sortOrder_idx`(`projectKey`, `treeMode`, `sortOrder`),
    INDEX `troubleshooting_edges_fromNodeId_toNodeId_idx`(`fromNodeId`, `toNodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_matchedFaqId_fkey` FOREIGN KEY (`matchedFaqId`) REFERENCES `faqs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_cases` ADD CONSTRAINT `diagnostic_cases_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnostic_cases` ADD CONSTRAINT `diagnostic_cases_duplicateOfDiagnosticId_fkey` FOREIGN KEY (`duplicateOfDiagnosticId`) REFERENCES `diagnostic_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_request_type_mappings` ADD CONSTRAINT `ticket_request_type_mappings_ticketServiceSettingsId_fkey` FOREIGN KEY (`ticketServiceSettingsId`) REFERENCES `ticket_service_settings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `troubleshooting_tree_settings` ADD CONSTRAINT `troubleshooting_tree_settings_projectKey_fkey` FOREIGN KEY (`projectKey`) REFERENCES `projects`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `troubleshooting_tree_versions` ADD CONSTRAINT `troubleshooting_tree_versions_projectKey_fkey` FOREIGN KEY (`projectKey`) REFERENCES `projects`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `troubleshooting_nodes` ADD CONSTRAINT `troubleshooting_nodes_projectKey_fkey` FOREIGN KEY (`projectKey`) REFERENCES `projects`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `troubleshooting_edges` ADD CONSTRAINT `troubleshooting_edges_projectKey_fkey` FOREIGN KEY (`projectKey`) REFERENCES `projects`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `troubleshooting_edges` ADD CONSTRAINT `troubleshooting_edges_fromNodeId_fkey` FOREIGN KEY (`fromNodeId`) REFERENCES `troubleshooting_nodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `troubleshooting_edges` ADD CONSTRAINT `troubleshooting_edges_toNodeId_fkey` FOREIGN KEY (`toNodeId`) REFERENCES `troubleshooting_nodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
