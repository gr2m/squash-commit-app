import { Probot, Context } from "probot";

interface PullRequestInfo {
  owner: string;
  repo: string;
  pull_number: number;
}

const getPRInfo = async (
  context: Context,
  { owner, repo, pull_number }: PullRequestInfo
) => {
  context.log.info(`Getting PR info from ${owner}/${repo}/pull/${pull_number}`);
  const {
    data: {
      commits,
      head: { sha, ref },
    },
  } = await context.octokit.pulls.get({
    owner,
    repo,
    pull_number,
  });

  return { commits, sha, ref };
};

async function getCommit(
  context: Context,
  sha: string,
  owner: string,
  repo: string
): Promise<any> {
  context.log.info(`Getting commit info from ${sha}`);
  const commit = await context.octokit.git.getCommit({
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    commit_sha: sha,
  });
  return commit.data;
}

async function updateRef(
  context: Context,
  sha: string,
  branch: string,
  owner: string,
  repo: string
): Promise<any> {
  context.log.info(`Changing ref for ${branch} to`, sha);

  return context.octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha,
  });
}

async function createEmptyCommit(
  context: Context,
  refCommit: any,
  owner: string,
  repo: string,
  ref: string
): Promise<any> {
  context.log.info("Creating empty commit");
  const commit = await context.octokit.git.createCommit({
    owner,
    repo,
    message: `empty commit to preset the squash & merge commit subject from the pull request title

Created by https://github.com/gr2m/squash-commit-app`,
    tree: refCommit.tree.sha,
    parents: [refCommit.sha],
  });

  return updateRef(context, commit.data.sha, ref, owner, repo);
}

const probotFunc = (app: Probot): void => {
  app.log("Yay! The app was loaded!");

  app.on(
    [
      "pull_request.opened",
      "pull_request.reopened",
      "pull_request.synchronize",
    ],
    async (context) => {
      context.log.debug("PR Opened or PR Synchronized!");
      const {
        payload: { pull_request, repository },
      } = context;

      const pullRequestInfo = {
        owner: repository.owner.login,
        repo: repository.name,
        pull_number: pull_request.number,
      };

      try {
        const { commits, sha, ref } = await getPRInfo(context, pullRequestInfo);

        if (commits > 1) {
          context.log.info("not a single commit PR");
          return;
        }

        const commit = await getCommit(
          context,
          sha,
          pullRequestInfo.owner,
          pullRequestInfo.repo
        );

        return createEmptyCommit(
          context,
          commit,
          pullRequestInfo.owner,
          pullRequestInfo.repo,
          ref
        );
      } catch (e) {
        context.log.error(e);
        throw e;
      }
    }
  );
};

export default probotFunc;
