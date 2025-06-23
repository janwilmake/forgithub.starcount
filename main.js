export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter((part) => part.length > 0);

    // Check if this is a GET request to /{username}
    if (request.method !== "GET" || pathParts.length !== 1) {
      return new Response("Usage: GET /{username}", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const username = pathParts[0];

    try {
      // Fetch user's repositories from GitHub API
      const reposResponse = await fetch(
        `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`,
        {
          headers: {
            "User-Agent": "Cloudflare-Worker-Star-History",
            // Add GitHub token if available in environment
            ...(env.GITHUB_TOKEN && {
              Authorization: `token ${env.GITHUB_TOKEN}`,
            }),
          },
        },
      );

      if (!reposResponse.ok) {
        if (reposResponse.status === 404) {
          return new Response(`User '${username}' not found`, {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        }
        throw new Error(`GitHub API error: ${reposResponse.status}`);
      }

      const repos = await reposResponse.json();

      // Filter out forks (optional - remove this filter if you want to include forks)
      const nonForkRepos = repos.filter((repo) => !repo.fork);

      // Sort by star count (descending) and take top 30
      const topRepos = nonForkRepos
        .sort((a, b) => b.stargazers_count - a.stargazers_count)
        .slice(0, 10)
        .filter((repo) => repo.stargazers_count > 0); // Only include repos with at least 1 star

      if (topRepos.length === 0) {
        return new Response(
          `No starred repositories found for user '${username}'`,
          {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          },
        );
      }

      // Create the repo list for the star-history URL
      const repoList = topRepos
        .map((repo) => `${username}/${repo.name}`)
        .join(",");

      // Generate the star-history URL
      const starHistoryUrl = `https://api.star-history.com/svg?repos=${encodeURIComponent(
        repoList,
      )}&type=Date`;

      // Return JSON response with metadata
      const response = {
        username: username,
        total_repos_found: repos.length,
        starred_repos_count: topRepos.length,
        star_history_url: starHistoryUrl,
        repositories: topRepos.map((repo) => ({
          name: repo.name,
          full_name: repo.full_name,
          stars: repo.stargazers_count,
          description: repo.description,
          language: repo.language,
          url: repo.html_url,
        })),
      };

      return new Response(JSON.stringify(response, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    } catch (error) {
      console.error("Error fetching repositories:", error);
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
  },
};
