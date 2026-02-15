/*
  Warnings:

  - Added the required column `branch_instance_id` to the `workflow_branches` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "workflow_branches" ADD COLUMN     "branch_instance_id" BIGINT NOT NULL;

-- AddForeignKey
ALTER TABLE "workflow_branches" ADD CONSTRAINT "workflow_branches_branch_instance_id_fkey" FOREIGN KEY ("branch_instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
