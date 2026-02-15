-- CreateTable
CREATE TABLE "workflow_branches" (
    "id" BIGSERIAL NOT NULL,
    "parent_instance_id" BIGINT NOT NULL,
    "state_id" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_branches_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "workflow_branches" ADD CONSTRAINT "workflow_branches_parent_instance_id_fkey" FOREIGN KEY ("parent_instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_branches" ADD CONSTRAINT "workflow_branches_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "workflow_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
