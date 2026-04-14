const { prisma } = require("../config/prisma");
const { chat, chatWithHistory, isLLMAvailable } = require("./openai.service");
const mem = require("../store/memoryStore");
const DEMO_MODE = String(process.env.DEMO_MODE || "true") === "true";

function tryParseJson(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const candidates = [raw];

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) candidates.push(fencedMatch[1].trim());

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // keep trying other likely JSON slices
    }
  }
  return null;
}

function uniqueStrings(values, max = 12) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

function extractResumeKeywords(resumeText = "") {
  const text = String(resumeText).toLowerCase();
  const keywordBank = [
    "React",
    "JavaScript",
    "TypeScript",
    "HTML",
    "CSS",
    "Tailwind",
    "Node.js",
    "Express",
    "REST API",
    "PostgreSQL",
    "MongoDB",
    "Git",
    "Testing",
    "Problem Solving",
    "Communication",
  ];
  return uniqueStrings(
    keywordBank.filter((keyword) => {
      const probe = keyword.toLowerCase().replace(".", "");
      return text.includes(keyword.toLowerCase()) || text.includes(probe);
    }),
  );
}

function buildFallbackResumeOptimization({ resumeText, targetRole }) {
  const lines = String(resumeText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const role = targetRole?.role || "Software Engineer";
  const firstLine = lines[0] || "your resume summary";
  const secondLine = lines[1] || "your strongest project bullet";
  const atsKeywords = extractResumeKeywords(resumeText);

  return {
    summary: `Your resume can be stronger for ${role} by adding measurable impact, role-specific keywords, and clearer project outcomes.`,
    atsKeywords: atsKeywords.length ? atsKeywords : ["React", "JavaScript", "REST API", "Git", "Problem Solving"],
    bulletEdits: [
      {
        originalHint: firstLine,
        improvedBullet:
          "Built and shipped user-facing features with clean component architecture, improving usability and reducing manual workflow friction.",
      },
      {
        originalHint: secondLine,
        improvedBullet:
          "Implemented and optimized core functionality with reliable API integration, resulting in faster load times and improved stability.",
      },
      {
        originalHint: "Generic responsibility statement",
        improvedBullet:
          "Collaborated using Git-based workflows, translated requirements into deliverables, and delivered iterations on schedule.",
      },
    ],
    linkedinTips: [
      "Use a headline with role + key skills (example: Frontend Developer | React | JavaScript).",
      "Pin 2 relevant projects in Featured section with GitHub/live links.",
      "Rewrite About section in 4-5 lines focused on outcomes and target role.",
    ],
    nextSteps: [
      "Add numbers to achievements (performance, users, time saved, quality gains).",
      "Tailor summary and skills section for each job description.",
      "Keep resume concise and role-focused, ideally one page for entry-level roles.",
    ],
  };
}

function normalizeSubjectKey(subject) {
  const s = String(subject || "").trim().toLowerCase();
  if (s.includes("python")) return "python";
  if (s.includes("typescript") || s === "ts") return "typescript";
  if (s.includes("react")) return "react";
  if (s.includes("next") && s.includes("js")) return "nextjs";
  if (s.includes("vue")) return "vue";
  if (s.includes("angular")) return "angular";
  if (s.includes("node") || s === "nodejs") return "nodejs";
  if (s.includes("express")) return "nodejs";
  if (s.includes("graphql")) return "graphql";
  if (s.includes("sql") || s.includes("database") || s.includes("dbms") || s.includes("postgres") || s.includes("mysql")) return "sql";
  if (s.includes("mongodb") || s.includes("mongo")) return "mongodb";
  if (s.includes("redis")) return "redis";
  if (s.includes("javascript") || s === "js") return "javascript";
  if (s.includes("java") && !s.includes("javascript")) return "java";
  if (s.includes("c++") || s.includes("cpp")) return "cpp";
  if (s.includes("c#") || s.includes("csharp") || s.includes("dotnet") || s.includes(".net")) return "csharp";
  if (s.includes("go") && (s.length <= 4 || s.includes("golang"))) return "golang";
  if (s.includes("rust")) return "rust";
  if (s.includes("swift")) return "swift";
  if (s.includes("kotlin")) return "kotlin";
  if (s.includes("flutter") || s.includes("dart")) return "flutter";
  if (s.includes("data structure") || s.includes("algorithm") || s === "dsa") return "dsa";
  if (s.includes("deep learning") || s.includes("neural")) return "deeplearning";
  if (s.includes("machine learning") || s === "ml") return "ml";
  if (s.includes("data science") || s.includes("datascience")) return "datascience";
  if (s.includes("statistic") || s === "stats") return "statistics";
  if (s.includes("system design") || s.includes("system architecture")) return "systemdesign";
  if (s.includes("docker") || s.includes("container")) return "docker";
  if (s.includes("kubernetes") || s === "k8s") return "kubernetes";
  if (s.includes("linux") || s.includes("bash") || s.includes("shell")) return "linux";
  if (s.includes("network") || s.includes("computer network") || s.includes("tcp") || s.includes("http")) return "networking";
  if (s.includes("cyber") || s.includes("security") || s.includes("ctf")) return "cybersecurity";
  if (s.includes("html") || s.includes("css") || s.includes("tailwind") || s.includes("web design")) return "htmlcss";
  if (s.includes("devops") || s.includes("ci/cd") || s.includes("cicd")) return "devops";
  if (s.includes("aws") || s.includes("cloud") || s.includes("azure") || s.includes("gcp")) return "cloud";
  if (s.includes("git") || s.includes("github") || s.includes("version control")) return "git";
  if (s.includes("competitive") || s.includes("leetcode") || s.includes("codeforces") || s.includes("competitive programming")) return "competitive";
  return s;
}

function detectTopic({ message, userContext }) {
  const text = String(message || "").toLowerCase();
  const focusSubjects = Array.isArray(userContext?.goals?.focusSubjects) ? userContext.goals.focusSubjects : [];

  const topicMap = [
    { keywords: ["python"], label: "Python" },
    { keywords: ["typescript", " ts "], label: "TypeScript" },
    { keywords: ["next.js", "nextjs", "next js"], label: "Next.js" },
    { keywords: ["react"], label: "React" },
    { keywords: ["vue"], label: "Vue.js" },
    { keywords: ["angular"], label: "Angular" },
    { keywords: ["node.js", "nodejs", "node js", "express"], label: "Node.js" },
    { keywords: ["graphql"], label: "GraphQL" },
    { keywords: ["mongodb", "mongo"], label: "MongoDB" },
    { keywords: ["redis"], label: "Redis" },
    { keywords: ["sql", "postgresql", "mysql", "dbms", "database"], label: "SQL" },
    { keywords: ["javascript", " js "], label: "JavaScript" },
    { keywords: ["java "], label: "Java" },
    { keywords: ["c++", "cpp"], label: "C++" },
    { keywords: ["c#", "csharp", ".net", "dotnet"], label: "C#/.NET" },
    { keywords: ["golang", " go "], label: "Go (Golang)" },
    { keywords: ["rust"], label: "Rust" },
    { keywords: ["swift"], label: "Swift" },
    { keywords: ["kotlin"], label: "Kotlin" },
    { keywords: ["flutter", "dart"], label: "Flutter" },
    { keywords: ["data structure", "algorithm", "dsa", "leetcode", "competitive"], label: "DSA" },
    { keywords: ["deep learning", "neural network", "cnn", "rnn", "transformer"], label: "Deep Learning" },
    { keywords: ["machine learning", " ml ", "sklearn", "scikit"], label: "Machine Learning" },
    { keywords: ["data science", "pandas", "numpy", "matplotlib"], label: "Data Science" },
    { keywords: ["statistic", "probability", "regression", "hypothesis"], label: "Statistics" },
    { keywords: ["system design", "scalability", "load balancer", "architecture"], label: "System Design" },
    { keywords: ["docker", "container", "dockerfile"], label: "Docker" },
    { keywords: ["kubernetes", "k8s", "helm"], label: "Kubernetes" },
    { keywords: ["linux", "bash", "shell script", "terminal"], label: "Linux & Bash" },
    { keywords: ["network", "tcp", "udp", "http", "dns", "osi"], label: "Computer Networks" },
    { keywords: ["cyber", "security", "ctf", "owasp", "penetration"], label: "Cybersecurity" },
    { keywords: ["html", "css", "tailwind", "bootstrap", "web design"], label: "HTML & CSS" },
    { keywords: ["devops", "ci/cd", "cicd", "jenkins", "github action"], label: "DevOps" },
    { keywords: ["aws", "azure", "gcp", "cloud"], label: "Cloud & AWS" },
    { keywords: ["git", "github", "version control"], label: "Git & GitHub" },
  ];

  for (const { keywords, label } of topicMap) {
    if (keywords.some((kw) => text.includes(kw))) return label;
  }

  if (focusSubjects.length > 0) return focusSubjects[0];
  return null;
}

function detectIntent(text) {
  const t = text.toLowerCase();
  if (/(how (do i|to) learn|study plan|roadmap|where (to|do i) start|get started|learning path|curriculum)/i.test(t)) return "roadmap";
  if (/(what is|what are|explain|define|tell me about|describe)/i.test(t)) return "explain";
  if (/(interview|crack|prepare for|job ready|hiring|get a job)/i.test(t)) return "interview";
  if (/(project|build|create|make|implement|side project|portfolio)/i.test(t)) return "project";
  if (/(career|job|salary|switch|transition|become a)/i.test(t)) return "career";
  if (/(motivat|stuck|demotivat|focus|procrastinat|distract|discourag)/i.test(t)) return "motivation";
  if (/(practice|exercise|problem|challenge|drill)/i.test(t)) return "practice";
  if (/(tip|trick|best practice|resource|book|course|youtube)/i.test(t)) return "resources";
  return "general";
}

function getCareerRoleForTopic(topicKey) {
  const map = {
    python: "Python Developer / Data Engineer / Backend Engineer",
    typescript: "Full-Stack TypeScript Developer / Frontend Engineer",
    react: "Frontend Developer / React Engineer / UI Developer",
    nextjs: "Full-Stack Next.js Developer / React Engineer",
    vue: "Frontend Developer / Vue.js Engineer",
    angular: "Angular Developer / Enterprise Frontend Engineer",
    nodejs: "Backend Developer / Node.js Engineer / API Developer",
    graphql: "API Developer / Full-Stack Engineer",
    sql: "Database Developer / Data Analyst / Backend Engineer",
    mongodb: "Backend Developer / NoSQL Database Engineer",
    javascript: "Frontend Developer / Full-Stack JavaScript Developer",
    java: "Java Developer / Backend Engineer / Android Developer",
    cpp: "Systems Programmer / Competitive Programmer / Game Developer",
    csharp: ".NET Developer / Game Developer (Unity) / Enterprise Developer",
    golang: "Backend Go Developer / Systems Engineer / Cloud Developer",
    rust: "Systems Programmer / WebAssembly Developer / Security Engineer",
    swift: "iOS Developer / macOS Developer",
    kotlin: "Android Developer / Kotlin Backend Developer",
    flutter: "Mobile Developer (iOS + Android) / Cross-Platform Engineer",
    dsa: "Software Engineer (any company) / Competitive Programmer",
    deeplearning: "ML Engineer / AI Researcher / Computer Vision Engineer",
    ml: "Machine Learning Engineer / Data Scientist / AI Engineer",
    datascience: "Data Scientist / Data Analyst / Business Intelligence Analyst",
    statistics: "Data Scientist / Quantitative Analyst / ML Engineer",
    systemdesign: "Senior Software Engineer / Solutions Architect / Tech Lead",
    docker: "DevOps Engineer / Site Reliability Engineer / Cloud Engineer",
    kubernetes: "DevOps Engineer / Kubernetes Administrator / Platform Engineer",
    linux: "DevOps Engineer / Systems Administrator / Backend Developer",
    networking: "Network Engineer / Cloud Architect / DevOps Engineer",
    cybersecurity: "Security Engineer / Penetration Tester / SOC Analyst",
    htmlcss: "Frontend Developer / UI Designer / Web Developer",
    devops: "DevOps Engineer / Site Reliability Engineer / Platform Engineer",
    cloud: "Cloud Engineer / Solutions Architect / DevOps Engineer",
    git: "Software Developer (any role) / DevOps Engineer",
    competitive: "Software Engineer at top tech companies / Competitive Programmer",
  };
  return map[topicKey] || "Software Developer / Tech Professional";
}

function buildFallbackTopicChat({ message, userContext }) {
  const topicLabel = detectTopic({ message, userContext });
  const topic = topicLabel || "your chosen topic";
  const topicKey = normalizeSubjectKey(topic);
  const difficulty = userContext?.goals?.difficulty || "intermediate";
  const topicBank = getTopicBankForSubject(topic, difficulty);
  const intent = detectIntent(message);
  const careerRole = getCareerRoleForTopic(topicKey);
  const careerGoal = userContext?.careerObjectives?.objectiveText;
  const userName = userContext?.displayName ? userContext.displayName.split(" ")[0] : null;
  const greeting = userName ? `Great question, ${userName}! ` : "";

  const t1 = topicBank[0] || `${topic} core fundamentals`;
  const t2 = topicBank[1] || `${topic} hands-on exercises`;
  const t3 = topicBank[2] || `${topic} practical mini-project`;
  const t4 = topicBank[3] || `${topic} applied concepts`;
  const t5 = topicBank[4] || `${topic} real-world usage`;
  const t6 = topicBank[5] || `${topic} review and assessment`;

  if (intent === "roadmap") {
    return `${greeting}Here's your personalized learning path for **${topic}** (${difficulty} level):

📚 **Week 1 — Foundation**
• ${t1}
• ${t2}
• Set up your dev environment and write your first working example

🛠 **Week 2 — Practice & Build**
• ${t3}
• ${t4}
• Build one small working project that uses what you've learned

📈 **Week 3 — Level Up**
• ${t5}
• ${t6}
• Review weak areas and refactor your Week 2 project with improvements

💡 **Tips for ${topic}:**
• Learn by doing — write code every day, even for 20 minutes
• Keep a notes file of concepts you misunderstood
• After each session, write 3 bullet points of what you learned

💼 **Career alignment:**
${careerGoal ? `Your goal (${careerGoal}) aligns well with ${topic}. ` : ""}Mastering ${topic} opens doors to roles like: **${careerRole}**.

Start with Week 1 today — pick the first topic and spend 30 minutes on it. That's all it takes to build momentum.`;
  }

  if (intent === "interview") {
    return `${greeting}Here's how to get interview-ready for **${topic}**:

🎯 **Core topics interviewers test:**
• ${t1}
• ${t2}
• ${t3}

📝 **Preparation strategy:**
1. Spend 2 days revisiting each core topic above
2. Practice explaining concepts out loud (the Feynman technique)
3. Do 2-3 practical coding/scenario exercises per topic
4. For each concept, prepare: "What is it? Why use it? When not to use it?"

🔥 **Common interview mistakes to avoid:**
• Skipping fundamentals and jumping to advanced topics
• Not being able to explain your reasoning while coding
• Ignoring edge cases in solutions

💼 **Target role:** ${careerRole}
${careerGoal ? `For your goal: "${careerGoal}" — make sure you can build a small ${topic} project and talk through its design.` : `Build at least one project using ${topic} and be ready to walk through it.`}

Start practicing today: pick one topic from the list above and explain it as if teaching a junior developer.`;
  }

  if (intent === "project") {
    return `${greeting}Here are concrete **project ideas for ${topic}** based on your level (${difficulty}):

🟢 **Beginner projects:**
• Build a small app using ${t1} as the core concept
• Create a mini tool that solves a real problem you have

🟡 **Intermediate projects:**
• Build a full-featured app covering: ${t2} and ${t3}
• Add persistence (database or local storage) and a clean UI

🔴 **Advanced projects:**
• Production-ready app with: ${t4}, ${t5}
• Include tests, error handling, and deployment

📋 **How to pick the right project:**
1. Choose something you'd actually use or show employers
2. Keep scope small — finish it in 1 week
3. Focus on clean code and good structure over fancy features
4. Deploy it (GitHub Pages, Vercel, Render — all free)

💼 This kind of project positions you for: **${careerRole}**

Pick one idea from above and start with just the simplest version. Ship something this week.`;
  }

  if (intent === "explain") {
    return `${greeting}Let me break down **${topic}** for you:

📖 **What it is:**
${topic} is a widely-used ${topicKey.includes("script") || topicKey === "javascript" || topicKey === "typescript" ? "programming language" : topicKey.includes("sql") || topicKey === "mongodb" ? "database technology" : topicKey === "dsa" ? "computer science fundamental" : topicKey === "systemdesign" ? "engineering discipline" : "technology"} that's essential for modern software development.

🔑 **Core concepts you need to understand:**
• ${t1}
• ${t2}
• ${t3}

🛠 **Where it's used:**
${topicKey === "python" ? "Web backends, data science, AI/ML, scripting, and automation." : topicKey === "react" ? "Frontend web applications, SPAs, and component-driven UIs." : topicKey === "sql" ? "Relational databases, data analysis, and backend data management." : topicKey === "dsa" ? "Coding interviews, algorithm optimization, and software engineering foundations." : topicKey === "systemdesign" ? "Architecting scalable systems, senior engineering interviews, and tech leadership." : `Professional ${topic} development across many software and tech roles.`}

📊 **Why it matters for your career:**
Professionals with ${topic} skills are in high demand for roles like: **${careerRole}**

💡 **Best way to learn it:**
Start with "${t1}", spend 1-2 days on it, build a small example, then move to the next concept.`;
  }

  if (intent === "motivation") {
    return `I hear you — it's completely normal to hit a wall while learning ${topic}. Here's how to get back on track:

⚡ **Right now (next 5 minutes):**
• Open your editor and write just one line of ${topic} code
• Don't aim for a full session — just get started and let momentum build

🎯 **Today's small win:**
• Complete just one thing: "${t1}"
• That's it. One topic, one focused session, done.

🔁 **This week's focus:**
• ${t2}
• ${t3}

🧠 **Remember:**
Every expert in ${topic} felt exactly like you do right now. The difference is they kept showing up — imperfectly, inconsistently, but they kept going.

${careerGoal ? `You're working toward: "${careerGoal}" — every session gets you closer, even the hard ones.` : `Every 30-minute session on ${topic} is an investment in your future career.`}

Start with just 20 minutes. Set a timer right now.`;
  }

  if (intent === "resources") {
    const resourceMap = {
      python: "Python.org official docs, Real Python (realpython.com), Automate the Boring Stuff (free online)",
      javascript: "MDN Web Docs (developer.mozilla.org), javascript.info, Eloquent JavaScript (free online)",
      react: "React official docs (react.dev), Scrimba React course, Full Stack Open (fullstackopen.com)",
      sql: "SQLZoo (sqlzoo.net), Mode Analytics SQL tutorial, PostgreSQL official docs",
      dsa: "LeetCode (for practice), NeetCode.io (patterns), Visualgo (visualgo.net for visualizations)",
      ml: "fast.ai (practical DL), Kaggle Learn (free), Scikit-learn official docs",
      systemdesign: "System Design Primer (GitHub), ByteByteGo, Designing Data-Intensive Applications (book)",
      docker: "Docker official docs, Play with Docker (labs.play-with-docker.com)",
      linux: "Linux Journey (linuxjourney.com), The Linux Command Line (free PDF), OverTheWire wargames",
    };

    const resources = resourceMap[topicKey] || `Official ${topic} documentation, YouTube tutorials, and freeCodeCamp`;

    return `${greeting}Here are the **best resources for learning ${topic}**:

📚 **Recommended learning sources:**
${resources}

🗂 **Learning structure:**
1. Start with official docs or a structured tutorial for the first week
2. Build a small project in week 2 to apply what you've learned
3. Move to practice problems or real-world projects in week 3+

📌 **Key topics to cover first:**
• ${t1}
• ${t2}
• ${t3}

💡 **Pro tip:** Don't switch resources after starting. Stick with one source until you've built at least one working project.

The best resource is always the one you'll actually use consistently.`;
  }

  if (intent === "career") {
    return `${greeting}Here's a career guide for **${topic}**:

💼 **Career roles this skill unlocks:**
${careerRole}

🗺 **What employers look for in ${topic}:**
• ${t1}
• ${t2}
• ${t3}
• A portfolio project showing real ${topic} skills
• Ability to explain your code and design decisions

📈 **3-step career action plan:**
1. **Master the core** — spend 2-3 weeks covering: ${t1}, ${t2}
2. **Build evidence** — create 1-2 portfolio projects using ${topic}
3. **Get visible** — push projects to GitHub, update LinkedIn, start applying

${careerGoal ? `🎯 **Your goal:** "${careerGoal}"\n${topic} is a direct pathway to this. Focus on portfolio projects that demonstrate real skills in this area.` : `🎯 **Next step:** Create a GitHub portfolio with at least one solid ${topic} project. Recruiters check GitHub before interviews.`}

Start preparing for roles like: **${careerRole}**`;
  }

  return `${greeting}Here's your focused study guidance for **${topic}** (${difficulty} level):

📚 **Study guidance:**
• Start with: ${t1}
• Next block: ${t2}
• Practice task: ${t3}
• This week's goal: ${t4}

🔧 **Hands-on exercise:**
Build one small, working example that demonstrates: "${t3}". This gives you something to show and something to learn from.

💼 **Career tip:**
${careerGoal ? `For your goal ("${careerGoal}"), ${topic} is a core skill. ` : ""}${topic} skills are directly applicable to roles like **${careerRole}**. Make sure your GitHub shows at least one ${topic} project.

🚀 **Motivation:**
Take one 25-minute focused session on ${topic} right now. Finishing one focused block is better than waiting for a perfect plan.`;
}

function getTopicBankForSubject(subject, difficulty = "intermediate") {
  const s = normalizeSubjectKey(subject);
  const level = String(difficulty || "intermediate").toLowerCase();

  const banks = {
    python: {
      beginner: [
        "Install Python, run scripts, variables, basic data types",
        "if/else, loops, lists, tuples, and dictionaries",
        "Functions, parameters, return values, and scope basics",
        "String methods, input/output, and simple exercises",
        "Files (read/write), exceptions, and debugging basics",
        "Mini CLI app: to-do or calculator",
        "Revision quiz + beginner project polish",
      ],
      intermediate: [
        "Comprehensions, iterators, and generators",
        "Functions deep dive: *args, **kwargs, decorators intro",
        "Modules, packages, and virtual environments",
        "Object-oriented design: classes, inheritance, dataclasses",
        "Requests/API handling, JSON workflows, and logging",
        "Testing with pytest and refactoring patterns",
        "Build API/data automation mini project",
      ],
      advanced: [
        "Memory model, mutability, and performance profiling",
        "Advanced OOP and design patterns in Python",
        "Concurrency: threading vs multiprocessing vs asyncio",
        "Async I/O with aiohttp and task orchestration",
        "Type hints, mypy, and robust package structure",
        "Optimization with numpy/pandas vectorized thinking",
        "Production-grade project: architecture, tests, CI flow",
      ],
    },
    react: {
      beginner: [
        "React setup, JSX, components, props, and basic state",
        "Events, conditional rendering, lists, and component composition",
        "useState/useEffect with simple fetch examples",
        "Forms, controlled components, and validation basics",
        "Routing fundamentals with react-router",
        "Build a small CRUD app UI",
        "Refine UX and review core concepts",
      ],
      intermediate: [
        "Hooks patterns: custom hooks and side-effect management",
        "State architecture: context and lightweight stores",
        "API layers, loading/error states, and retry behavior",
        "Performance: memoization, splitting, and render debugging",
        "Reusable design system components",
        "Testing with React Testing Library",
        "Feature module mini-project integration",
      ],
      advanced: [
        "Advanced rendering mental model and reconciliation",
        "Complex state machines and async orchestration",
        "Code-splitting strategy and bundle optimization",
        "Server state patterns and caching strategy",
        "Accessibility audits and keyboard UX hardening",
        "Advanced testing and performance budgets",
        "Production hardening + monitoring patterns",
      ],
    },
    sql: {
      beginner: [
        "SELECT basics, filtering with WHERE, sorting and limiting",
        "Aggregate functions: COUNT, SUM, AVG, MIN, MAX",
        "GROUP BY and HAVING with real examples",
        "INNER JOIN and LEFT JOIN fundamentals",
        "INSERT, UPDATE, DELETE and table constraints",
        "Practice queries on student/sales datasets",
        "Mini assessment: 20 mixed SQL questions",
      ],
      intermediate: [
        "Advanced joins and multi-table query planning",
        "Subqueries and Common Table Expressions (CTEs)",
        "Window functions: ROW_NUMBER, RANK, LAG, LEAD",
        "Indexing strategy and query optimization basics",
        "Transactions, ACID, and isolation levels",
        "Stored procedures/views use cases",
        "Case-study queries for reporting dashboard",
      ],
      advanced: [
        "Execution plans and deep query tuning",
        "Partitioning and performance at scale",
        "Advanced indexing (composite, covering, partial)",
        "Concurrency control and lock troubleshooting",
        "Data modeling trade-offs for OLTP vs analytics",
        "High-volume migration and rollback strategy",
        "Production SQL optimization sprint",
      ],
    },
    javascript: {
      beginner: [
        "Variables, data types, operators, and control flow",
        "Functions, arrays, objects, and loops",
        "DOM selection and event handling basics",
        "ES6 essentials: let/const, arrow functions, template literals",
        "Form handling and simple validations",
        "Fetch API basics and JSON handling",
        "Mini project: interactive to-do app",
      ],
      intermediate: [
        "Closures, scope chain, and this behavior",
        "Async JS: promises, async/await, error handling",
        "Modules, bundling concepts, and code organization",
        "Performance and memory leak prevention",
        "Reusable utility patterns and clean architecture",
        "Testing basics with unit-style examples",
        "Build feature-rich app module",
      ],
      advanced: [
        "Event loop internals and microtask/macrotask queues",
        "Advanced async patterns and cancellation handling",
        "Functional programming patterns in JS",
        "Rendering performance optimization strategies",
        "Security hardening (XSS, CSRF awareness)",
        "Scalable frontend architecture decisions",
        "Production readiness and profiling workflow",
      ],
    },
    java: {
      beginner: [
        "Java setup, syntax, variables, and control statements",
        "Methods, arrays, and String handling",
        "OOP basics: classes, objects, constructors",
        "Inheritance, polymorphism, and interfaces",
        "Collections framework basics",
        "Exception handling and file I/O",
        "Mini console app project and review",
      ],
      intermediate: [
        "Generics, collections deep dive, and comparators",
        "Streams API and lambda expressions",
        "Multithreading basics and synchronization",
        "JDBC basics and SQL integration",
        "Design patterns in Java applications",
        "JUnit testing and debugging workflow",
        "Build layered mini backend service",
      ],
      advanced: [
        "JVM internals, memory tuning, and GC basics",
        "Advanced concurrency and executor framework",
        "Microservice design with Spring concepts",
        "Performance profiling and optimization",
        "Security and resilient architecture patterns",
        "Distributed systems concerns in Java services",
        "Production-level Java service hardening",
      ],
    },
    cpp: {
      beginner: [
        "C++ syntax, variables, conditions, loops",
        "Functions, arrays, pointers basics",
        "References and memory fundamentals",
        "Classes, objects, constructors, destructors",
        "STL basics: vector, map, set",
        "File handling and exception basics",
        "Practice problems and mini project",
      ],
      intermediate: [
        "OOP deep dive and operator overloading",
        "Templates and generic programming",
        "Smart pointers and RAII patterns",
        "STL algorithms and iterators",
        "Move semantics and modern C++ features",
        "Debugging with gdb/lldb workflow",
        "Problem-solving sprint with optimization",
      ],
      advanced: [
        "Memory model and performance tuning",
        "Concurrency with threads, mutex, atomics",
        "Advanced template metaprogramming concepts",
        "Low-latency patterns and cache-aware design",
        "Build systems, profiling, and sanitizers",
        "System-level architecture in C++",
        "Production-grade C++ project refinement",
      ],
    },
    dsa: {
      beginner: [
        "Big-O basics, arrays, strings, and hashing",
        "Linked lists, stacks, queues fundamentals",
        "Recursion basics and simple backtracking",
        "Binary search and sorting patterns",
        "Trees basics: traversal and binary trees",
        "Practice easy coding problems",
        "Revision set + interview-style recap",
      ],
      intermediate: [
        "Advanced trees: BST, heap, trie",
        "Graphs: BFS, DFS, shortest path basics",
        "Dynamic programming patterns",
        "Greedy and two-pointer/sliding-window techniques",
        "Disjoint set and advanced data structures",
        "Medium-level timed problem practice",
        "Mock interview round and feedback",
      ],
      advanced: [
        "Segment tree, Fenwick tree, sparse table",
        "Advanced graph algorithms and optimization",
        "DP optimizations and state compression",
        "String algorithms: KMP, Z, rolling hash",
        "Computational geometry/advanced topics overview",
        "Hard problem strategy and contest planning",
        "Final high-difficulty interview simulation",
      ],
    },
    ml: {
      beginner: [
        "ML workflow, data preprocessing, train/test split",
        "Linear regression and model evaluation basics",
        "Classification with logistic regression",
        "Feature engineering and scaling concepts",
        "Decision trees and random forest intro",
        "Hands-on sklearn mini project",
        "Model review and practical recap",
      ],
      intermediate: [
        "Bias-variance tradeoff and cross-validation",
        "SVM, ensemble methods, and hyperparameter tuning",
        "Clustering and dimensionality reduction",
        "Pipeline design and reproducible experiments",
        "Model interpretation and error analysis",
        "Intermediate end-to-end ML project",
        "Deployment basics with model serving intro",
      ],
      advanced: [
        "Advanced feature selection and model diagnostics",
        "Time-series and sequence modeling basics",
        "Deep learning pipeline planning",
        "MLOps concepts: versioning, monitoring, drift",
        "Scalability and inference optimization",
        "Experiment tracking and model governance",
        "Production ML project hardening",
      ],
    },
    typescript: {
      beginner: [
        "TypeScript setup, tsconfig basics, and running ts-node",
        "Type annotations: string, number, boolean, arrays, tuples",
        "Interfaces vs type aliases — when to use each",
        "Functions with typed parameters and return types",
        "Union types, intersection types, and type guards",
        "Enums and optional/default properties",
        "Convert a plain JS project to TypeScript",
      ],
      intermediate: [
        "Generics: writing reusable typed functions and components",
        "Utility types: Partial, Readonly, Record, Pick, Omit",
        "Advanced type inference and conditional types",
        "Decorators and metadata reflection basics",
        "TypeScript with React: typed props, state, and hooks",
        "Module resolution, declaration files, and @types",
        "Type-safe API layer project",
      ],
      advanced: [
        "Template literal types and mapped types",
        "Discriminated unions and exhaustive type checking",
        "Infer keyword and advanced conditional types",
        "TypeScript compiler API and custom transformers",
        "Strict mode hardening and strict null checks",
        "Performance impact of complex types",
        "Production TypeScript project with full type safety",
      ],
    },
    nodejs: {
      beginner: [
        "Node.js setup, module system (require/import), and running scripts",
        "File system (fs), path, and OS modules",
        "HTTP module and building a basic server",
        "Express.js setup, routing, and middleware basics",
        "Reading/writing JSON data files",
        "Environment variables with dotenv",
        "Build a simple REST API with Express",
      ],
      intermediate: [
        "Middleware patterns, error handling, and request validation",
        "Authentication with JWT and bcrypt",
        "Database integration with Prisma or Mongoose",
        "Async patterns: promises, async/await, error propagation",
        "Rate limiting, CORS, and security best practices",
        "Testing Node.js APIs with Jest or Supertest",
        "Build a full CRUD API with auth",
      ],
      advanced: [
        "Streams and Buffer for efficient data handling",
        "Worker threads and cluster module for CPU tasks",
        "Event loop internals and libuv understanding",
        "WebSocket and Socket.io for real-time features",
        "Microservices patterns and service communication",
        "Node.js performance profiling and memory management",
        "Production deployment: PM2, Docker, health checks",
      ],
    },
    nextjs: {
      beginner: [
        "Next.js setup: pages router vs app router basics",
        "File-based routing, link navigation, and dynamic routes",
        "Static generation (SSG) vs server-side rendering (SSR)",
        "API routes: creating and calling backend endpoints",
        "Image optimization and font loading with next/image",
        "CSS Modules and Tailwind integration",
        "Deploy a simple Next.js app to Vercel",
      ],
      intermediate: [
        "App Router: layouts, loading states, and error boundaries",
        "Server Components vs Client Components — when to use each",
        "Data fetching: fetch with caching, ISR, and revalidation",
        "Middleware for auth and redirects",
        "Authentication with NextAuth.js",
        "Database integration with Prisma and server actions",
        "Build a full-stack Next.js app with auth and CRUD",
      ],
      advanced: [
        "Advanced caching strategies and cache invalidation",
        "Streaming and Suspense for progressive rendering",
        "Next.js internationalization (i18n) routing",
        "Edge runtime and middleware performance",
        "Monorepo setup with Turborepo",
        "Advanced SEO: metadata API, sitemap, and structured data",
        "Production hardening: security headers, rate limiting, observability",
      ],
    },
    vue: {
      beginner: [
        "Vue 3 setup (Vite), Options API vs Composition API",
        "Template syntax, v-bind, v-model, v-if, v-for",
        "Components: props, emits, and slots",
        "Reactive state with ref() and reactive()",
        "Lifecycle hooks and watchers",
        "Vue Router: setup, navigation, and dynamic routes",
        "Build a simple task manager app",
      ],
      intermediate: [
        "Composables: building reusable logic with Composition API",
        "Pinia for global state management",
        "Advanced component patterns: provide/inject, renderless components",
        "Form validation and controlled inputs",
        "Fetching data with composables and error handling",
        "Vue transitions and animations",
        "Build a multi-page app with Pinia state",
      ],
      advanced: [
        "Render functions and virtual DOM internals",
        "Plugin authoring and Vue application architecture",
        "Performance optimization: lazy loading, keep-alive",
        "Server-Side Rendering with Nuxt.js",
        "Testing Vue components with Vitest and Vue Test Utils",
        "TypeScript integration with Vue 3",
        "Production-ready Vue app with SSR and testing",
      ],
    },
    graphql: {
      beginner: [
        "GraphQL vs REST: when and why to use GraphQL",
        "Schema definition language: types, queries, mutations",
        "Setting up Apollo Server with Express",
        "Resolvers: connecting schema to data sources",
        "GraphQL Playground and testing queries",
        "Variables and arguments in queries",
        "Build a simple GraphQL API for a blog or tasks",
      ],
      intermediate: [
        "Nested queries and resolver chaining",
        "DataLoader for batching and caching (N+1 problem)",
        "Authentication and authorization in resolvers",
        "Subscriptions for real-time data",
        "Apollo Client: queries, mutations, and caching on frontend",
        "Error handling and custom error types",
        "Full-stack GraphQL project with React Apollo",
      ],
      advanced: [
        "Schema stitching and federation (Apollo Federation)",
        "Custom scalars and directives",
        "Performance: query complexity, depth limiting, persisted queries",
        "Code-first vs schema-first architecture decisions",
        "GraphQL security: injection prevention and rate limiting",
        "Testing GraphQL APIs end-to-end",
        "Production GraphQL service with monitoring",
      ],
    },
    mongodb: {
      beginner: [
        "MongoDB setup, Atlas, and Compass GUI",
        "Documents, collections, and BSON data model",
        "CRUD operations: insertOne, find, updateOne, deleteOne",
        "Query operators: $gt, $lt, $in, $regex, $elemMatch",
        "Indexes: why they matter and creating basic indexes",
        "Mongoose setup: schemas, models, and validation",
        "Build a simple CRUD app with Node.js + Mongoose",
      ],
      intermediate: [
        "Aggregation pipeline: $match, $group, $project, $sort",
        "Lookup ($lookup) for joining collections",
        "Schema design: embedding vs referencing trade-offs",
        "Advanced indexing: compound, text, and sparse indexes",
        "Mongoose virtuals, middleware, and populate",
        "Transactions and multi-document atomicity",
        "Build a full API with aggregation reporting",
      ],
      advanced: [
        "Sharding and horizontal scaling architecture",
        "Replica sets and high availability setup",
        "Change streams for real-time data processing",
        "Atlas Search: full-text and vector search",
        "Performance tuning: explain() and query profiling",
        "Time-series collections and data archival",
        "Production MongoDB deployment and monitoring",
      ],
    },
    csharp: {
      beginner: [
        "C# setup (Visual Studio / .NET CLI), syntax, and Hello World",
        "Variables, data types, control flow, and loops",
        "Methods, classes, and object-oriented basics",
        "Inheritance, interfaces, and polymorphism",
        "Collections: List<T>, Dictionary, LINQ basics",
        "Exception handling and file I/O",
        "Build a console app (calculator or to-do list)",
      ],
      intermediate: [
        "LINQ queries: filtering, ordering, grouping, and projections",
        "Async/await and Task-based async programming",
        "Entity Framework Core: models, migrations, and queries",
        "ASP.NET Core: controllers, routing, and middleware",
        "Dependency injection and service container",
        "Unit testing with xUnit and mocking",
        "Build a REST API with ASP.NET Core + EF Core",
      ],
      advanced: [
        "Advanced async patterns and cancellation tokens",
        "Memory management, Span<T>, and performance optimization",
        "Clean Architecture and domain-driven design patterns",
        "SignalR for real-time web applications",
        "Microservices with .NET and gRPC",
        "Blazor for interactive web UI",
        "Production .NET service: Docker, CI/CD, observability",
      ],
    },
    golang: {
      beginner: [
        "Go setup, workspace, go.mod, and Hello World",
        "Variables, constants, basic types, and control flow",
        "Functions, multiple return values, and named returns",
        "Arrays, slices, maps, and range loops",
        "Structs, methods, and interfaces",
        "Error handling idiom: error as return value",
        "Build a simple CLI tool or HTTP server",
      ],
      intermediate: [
        "Goroutines and channels for concurrency",
        "Select statement and channel patterns",
        "Context package for cancellation and timeouts",
        "Standard library: net/http, encoding/json, os",
        "Testing with the testing package and testify",
        "Building a REST API with Go + database",
        "Dependency management and modules",
      ],
      advanced: [
        "Advanced concurrency patterns: worker pools, fan-out/in",
        "Memory model and data race detection",
        "Performance profiling with pprof",
        "gRPC services with protobuf in Go",
        "Build scalable microservices with Go",
        "Generics (Go 1.18+): type parameters and constraints",
        "Production Go service: observability, graceful shutdown",
      ],
    },
    deeplearning: {
      beginner: [
        "Neural network basics: neurons, layers, activations",
        "Forward propagation and backpropagation intuition",
        "TensorFlow or PyTorch: tensors and basic operations",
        "Training loop: loss function, optimizer, gradient descent",
        "Image classification with a simple CNN",
        "Overfitting: dropout, batch norm, early stopping",
        "Train a model on MNIST or CIFAR-10",
      ],
      intermediate: [
        "Convolutional Neural Networks (CNN) architecture patterns",
        "Transfer learning with pretrained models (ResNet, VGG)",
        "Recurrent networks (RNN, LSTM) for sequential data",
        "Text classification and embeddings",
        "Data augmentation and custom datasets",
        "GPU training and mixed precision",
        "Build an image classifier or sentiment analyzer",
      ],
      advanced: [
        "Transformer architecture and attention mechanisms",
        "Fine-tuning large language models (LLMs)",
        "Generative models: GANs and Diffusion models",
        "Object detection: YOLO, Faster R-CNN",
        "Custom training loops, hooks, and callbacks",
        "Model deployment: ONNX, TorchServe, TF Serving",
        "Production DL pipeline: versioning, monitoring, A/B testing",
      ],
    },
    datascience: {
      beginner: [
        "Python for data: NumPy arrays and Pandas DataFrames",
        "Data loading, inspection, and cleaning",
        "Exploratory data analysis (EDA) with Matplotlib/Seaborn",
        "Descriptive statistics and distributions",
        "Data filtering, groupby, merging, and reshaping",
        "Basic data visualization: bar, line, scatter, heatmap",
        "End-to-end EDA project on a real dataset (Kaggle)",
      ],
      intermediate: [
        "Feature engineering: encoding, scaling, and imputation",
        "Machine learning pipeline with sklearn",
        "Model evaluation: confusion matrix, ROC, RMSE, R2",
        "Cross-validation and hyperparameter tuning",
        "Time-series analysis: trends, seasonality, and forecasting",
        "SQL for data analysis: CTEs, window functions, aggregations",
        "Build an end-to-end ML project with reporting",
      ],
      advanced: [
        "Advanced feature selection techniques",
        "Ensemble methods: stacking, blending, boosting",
        "A/B testing and statistical significance",
        "Big data tools: Spark and distributed processing intro",
        "Data pipelines and workflow orchestration (Airflow)",
        "Experiment tracking with MLflow",
        "Productionizing models and building a DS portfolio",
      ],
    },
    statistics: {
      beginner: [
        "Descriptive stats: mean, median, mode, variance, std dev",
        "Probability basics: events, sample space, rules",
        "Common distributions: normal, binomial, Poisson",
        "Random variables and expected value",
        "Sampling methods and the Central Limit Theorem",
        "Confidence intervals and margin of error",
        "Apply stats to a real dataset with Python",
      ],
      intermediate: [
        "Hypothesis testing: null hypothesis, p-value, significance",
        "t-tests, chi-square tests, and ANOVA",
        "Correlation and simple linear regression",
        "Multiple regression and OLS assumptions",
        "Bayes' theorem and Bayesian thinking",
        "Resampling: bootstrap methods and permutation tests",
        "Statistical analysis of a real-world case study",
      ],
      advanced: [
        "Logistic regression and classification metrics",
        "Bayesian inference with PyMC or Stan",
        "Survival analysis and time-to-event models",
        "Causal inference and experimental design",
        "Power analysis and sample size calculation",
        "Generalized linear models (GLMs)",
        "Publication-quality statistical reporting and visualization",
      ],
    },
    systemdesign: {
      beginner: [
        "What is system design and why it matters in interviews",
        "Client-server model, APIs, and HTTP basics",
        "Databases: SQL vs NoSQL trade-offs",
        "Caching concepts: in-memory caching with Redis",
        "Load balancing basics and horizontal scaling",
        "CAP theorem and consistency vs availability",
        "Design a simple URL shortener (TinyURL)",
      ],
      intermediate: [
        "Rate limiting strategies: token bucket, leaky bucket",
        "Message queues and async processing (Kafka, RabbitMQ)",
        "Database sharding, replication, and read replicas",
        "Content Delivery Networks (CDN) and edge caching",
        "API Gateway patterns and microservices communication",
        "Designing for high availability and fault tolerance",
        "Design Twitter feed, Instagram, or WhatsApp",
      ],
      advanced: [
        "Distributed consensus: Raft, Paxos basics",
        "Event sourcing and CQRS patterns",
        "Designing globally distributed systems",
        "Observability: metrics, tracing, and logging at scale",
        "Database internals: LSM trees, B-trees, WAL",
        "Designing for 10M+ users: real-world case studies",
        "Lead a full system design session with trade-off analysis",
      ],
    },
    docker: {
      beginner: [
        "What is Docker, containers vs VMs, and Docker Desktop setup",
        "docker run, pull, ps, stop, rm commands",
        "Writing your first Dockerfile: FROM, RUN, COPY, CMD",
        "Building and tagging images: docker build",
        "Volumes and bind mounts for persistent data",
        "Networking basics: port mapping and container networking",
        "Containerize a simple Node.js or Python app",
      ],
      intermediate: [
        "Docker Compose: multi-container apps (app + DB + Redis)",
        "Environment variables and secrets management",
        "Multi-stage builds for smaller production images",
        "Container registries: Docker Hub and private registries",
        "Docker networking: bridge, host, and overlay",
        "Health checks and restart policies",
        "Containerize a full-stack app with Docker Compose",
      ],
      advanced: [
        "Docker layer caching strategy for fast CI builds",
        "Security: non-root users, read-only filesystems, scanning",
        "Optimizing image sizes and build performance",
        "Docker Swarm for simple orchestration",
        "Integration with CI/CD pipelines",
        "Debugging containers: logs, exec, inspect",
        "Production container strategy with monitoring",
      ],
    },
    linux: {
      beginner: [
        "Terminal basics: ls, cd, pwd, mkdir, rm, cp, mv",
        "File permissions: chmod, chown, and umask",
        "Text editors: nano and vim basics",
        "Users and groups management",
        "Package management: apt, yum, or brew",
        "Processes: ps, top, kill, and background jobs",
        "Write your first bash script",
      ],
      intermediate: [
        "Shell scripting: variables, loops, conditionals, functions",
        "File I/O: stdin, stdout, stderr, pipes, and redirection",
        "cron jobs and task scheduling",
        "SSH: key-based auth, tunneling, and scp",
        "Networking tools: curl, wget, netstat, ss, iptables basics",
        "System monitoring: df, du, free, vmstat, iostat",
        "Automate a server task with a shell script",
      ],
      advanced: [
        "Linux boot process and systemd services",
        "Advanced bash: error handling, arrays, and string manipulation",
        "Performance tuning: kernel parameters and resource limits",
        "Network configuration: ip command, routing, and firewalls",
        "Linux security: SELinux/AppArmor, audit logs, hardening",
        "Containers and namespaces (the Linux primitives behind Docker)",
        "Write a production-ready deployment script",
      ],
    },
    networking: {
      beginner: [
        "OSI model: 7 layers explained with real examples",
        "TCP vs UDP: differences and when each is used",
        "IP addresses, subnets, and CIDR notation",
        "DNS: how domain names resolve to IPs",
        "HTTP/HTTPS: request/response cycle and status codes",
        "MAC addresses and ARP in local networks",
        "Build a basic client-server socket program",
      ],
      intermediate: [
        "TCP 3-way handshake, flow control, and congestion control",
        "HTTP/2 and HTTP/3 (QUIC): improvements over HTTP/1.1",
        "SSL/TLS: certificates, handshake, and encryption basics",
        "NAT, proxies, and VPNs",
        "Firewalls, packet filtering, and ACLs",
        "REST API design and HTTP best practices",
        "Capture and analyze traffic with Wireshark",
      ],
      advanced: [
        "BGP routing and autonomous systems (internet routing)",
        "SDN (Software-Defined Networking) concepts",
        "Network performance tuning and bottleneck analysis",
        "Load balancing algorithms and reverse proxies (Nginx, HAProxy)",
        "WebSocket and real-time communication protocols",
        "Kubernetes networking: CNI plugins, services, ingress",
        "Design a resilient network architecture for a web service",
      ],
    },
    cybersecurity: {
      beginner: [
        "CIA triad: Confidentiality, Integrity, Availability",
        "Common attacks: phishing, SQL injection, XSS, CSRF",
        "Password security: hashing, salting, and password managers",
        "HTTPS, TLS, and certificate management basics",
        "Linux security basics: users, permissions, firewall",
        "OWASP Top 10: overview of the most critical web vulnerabilities",
        "Set up a virtual lab with Kali Linux",
      ],
      intermediate: [
        "Web application penetration testing methodology",
        "SQL injection: detection, exploitation, and prevention",
        "XSS attacks: reflected, stored, and DOM-based",
        "Authentication vulnerabilities: JWT attacks, session hijacking",
        "Burp Suite for web app testing",
        "Network scanning with nmap and service enumeration",
        "Solve 3 HackTheBox or TryHackMe beginner boxes",
      ],
      advanced: [
        "Binary exploitation basics: buffer overflow, ROP chains",
        "Privilege escalation techniques (Linux and Windows)",
        "Active Directory attacks: Kerberoasting, Pass-the-Hash",
        "Malware analysis: static and dynamic analysis basics",
        "Red team vs blue team operations",
        "SIEM and log analysis for incident response",
        "Complete a CTF competition or get CEH/OSCP certification",
      ],
    },
    htmlcss: {
      beginner: [
        "HTML structure: DOCTYPE, head, body, semantic tags",
        "Text, links, images, lists, and tables",
        "Forms: input types, labels, and form attributes",
        "CSS selectors: tag, class, ID, pseudo-classes",
        "Box model: margin, border, padding, content",
        "Colors, fonts, and basic styling",
        "Build a personal portfolio page",
      ],
      intermediate: [
        "Flexbox layout: aligning and distributing items",
        "CSS Grid: two-dimensional layouts",
        "Responsive design: media queries and mobile-first approach",
        "CSS variables (custom properties) and theming",
        "Transitions and animations with keyframes",
        "Tailwind CSS utility-first workflow",
        "Build a fully responsive landing page",
      ],
      advanced: [
        "CSS architecture: BEM, SMACSS, or utility-first patterns",
        "Performance: critical rendering path and paint optimization",
        "Accessibility: ARIA roles, keyboard navigation, screen readers",
        "CSS-in-JS solutions and styled components",
        "Advanced animations: scroll-driven, view transitions",
        "Dark mode theming with CSS variables",
        "Audit and optimize a real site for accessibility + performance",
      ],
    },
    devops: {
      beginner: [
        "DevOps concepts: CI/CD, automation, and the DevOps lifecycle",
        "Git workflows: feature branches, pull requests, and merging",
        "Writing a Dockerfile and building container images",
        "GitHub Actions: creating your first workflow",
        "Environment management with .env and secrets",
        "Shell scripting for automation",
        "Deploy a simple app to a cloud VM",
      ],
      intermediate: [
        "CI/CD pipelines: build, test, and deploy stages",
        "Infrastructure as Code with Terraform basics",
        "Docker Compose for multi-service local environments",
        "Kubernetes fundamentals: pods, services, deployments",
        "Nginx as a reverse proxy and load balancer",
        "Monitoring with Prometheus and Grafana",
        "Build a complete CI/CD pipeline for a web app",
      ],
      advanced: [
        "Advanced Kubernetes: Helm charts, operators, and RBAC",
        "GitOps with ArgoCD or Flux",
        "Terraform modules and remote state management",
        "Service mesh with Istio",
        "Chaos engineering and resilience testing",
        "Distributed tracing with Jaeger/Zipkin",
        "Design and implement a production DevOps platform",
      ],
    },
    cloud: {
      beginner: [
        "Cloud computing concepts: IaaS, PaaS, SaaS",
        "AWS core services: EC2, S3, IAM, VPC basics",
        "Deploying a web server on EC2",
        "S3 for static hosting and object storage",
        "RDS: managed relational databases on AWS",
        "AWS CLI and basic scripting",
        "Host a static website on S3 + CloudFront",
      ],
      intermediate: [
        "Auto Scaling Groups and Elastic Load Balancers",
        "Lambda serverless functions and event triggers",
        "API Gateway + Lambda for serverless APIs",
        "CloudFormation for infrastructure as code",
        "AWS security: VPC, security groups, IAM policies",
        "Monitoring with CloudWatch: metrics, logs, alarms",
        "Build and deploy a serverless REST API on AWS",
      ],
      advanced: [
        "ECS/EKS for containerized workloads",
        "Multi-region architectures and disaster recovery",
        "AWS Well-Architected Framework: 6 pillars",
        "Cost optimization: reserved instances, Savings Plans, rightsizing",
        "Advanced IAM: policies, roles, SCP, and permission boundaries",
        "Data pipelines with Glue, Kinesis, and Redshift",
        "Prepare for AWS Solutions Architect certification",
      ],
    },
    git: {
      beginner: [
        "Git setup, config, and initializing a repository",
        "git add, commit, status, and log",
        "Working with branches: create, switch, and delete",
        "Merging branches and resolving simple conflicts",
        "Remote repositories: push, pull, fetch, and clone",
        "GitHub workflow: fork, pull request, and code review",
        "Build a personal project and push it to GitHub",
      ],
      intermediate: [
        "Git rebase: linear history and interactive rebase",
        "Cherry-pick, stash, and reflog for recovery",
        "Advanced branching: GitFlow and trunk-based development",
        "Resolving complex merge conflicts",
        "Git hooks for pre-commit automation",
        "Tagging, versioning, and release management",
        "Contribute to an open-source project",
      ],
      advanced: [
        "Monorepo strategies and submodules",
        "Git internals: objects, refs, and the .git directory",
        "Rewriting history safely: filter-branch and git-filter-repo",
        "Advanced CI/CD with Git triggers",
        "Repository maintenance: GC, pack files, and performance",
        "Security: signed commits and verified GPG",
        "Design a Git workflow for a team of 10+ engineers",
      ],
    },
    competitive: {
      beginner: [
        "Big-O analysis and choosing the right algorithm",
        "Array and string manipulation patterns",
        "Two pointers and sliding window techniques",
        "Binary search: template and common applications",
        "Stack and queue problems",
        "Hash maps: frequency counting and lookup patterns",
        "Solve 20 LeetCode easy problems across these patterns",
      ],
      intermediate: [
        "Linked list manipulation and fast/slow pointer",
        "Tree traversals: BFS, DFS, level order",
        "Graph algorithms: BFS, DFS, cycle detection",
        "Dynamic programming: top-down and bottom-up",
        "Backtracking: subsets, permutations, and N-Queens",
        "Heap: kth largest/smallest, merge k sorted lists",
        "Complete NeetCode 150 or Blind 75 problem set",
      ],
      advanced: [
        "Segment tree and Fenwick tree for range queries",
        "Dijkstra, Bellman-Ford, and Floyd-Warshall for shortest path",
        "Minimum spanning tree: Kruskal and Prim",
        "DP optimizations: monotonic queue, convex hull trick",
        "String algorithms: KMP, Z-function, Aho-Corasick",
        "Bit manipulation tricks and advanced math patterns",
        "FAANG-style mock interview: timed, 2-problem sessions",
      ],
    },
    redis: {
      beginner: [
        "Redis setup, CLI, and basic data types: string, list, set",
        "SET, GET, DEL, EXPIRE, TTL commands",
        "Hashes for structured object storage",
        "Sorted sets for leaderboards and ranking",
        "Pub/Sub messaging for simple notifications",
        "Connecting Redis to Node.js or Python",
        "Build a simple caching layer for API responses",
      ],
      intermediate: [
        "Redis as a session store with express-session",
        "Rate limiting implementation with Redis counters",
        "Lua scripting for atomic operations",
        "Redis Streams for event sourcing",
        "Persistence: RDB snapshots vs AOF logging",
        "Redis Cluster for horizontal scaling",
        "Build a leaderboard or task queue with Redis",
      ],
      advanced: [
        "Distributed locks with RedLock algorithm",
        "Redis as a primary database: use cases and trade-offs",
        "Advanced pub/sub and message routing patterns",
        "Redis Modules: RediSearch, RedisJSON",
        "Performance tuning and memory optimization",
        "Monitoring Redis: latency, memory, eviction policies",
        "Production Redis: replication, failover, and sentinel",
      ],
    },
    flutter: {
      beginner: [
        "Flutter setup, Dart basics, and Hello World app",
        "Widgets: stateless vs stateful",
        "Layouts: Column, Row, Container, Padding",
        "Text, Image, Button, and Icon widgets",
        "Navigation: push/pop routes",
        "State management basics with setState",
        "Build a simple counter or to-do app",
      ],
      intermediate: [
        "State management with Provider or Riverpod",
        "REST API integration: http package and JSON parsing",
        "Forms and validation in Flutter",
        "Custom widgets and reusable components",
        "Animations: implicit and explicit",
        "Local storage: SharedPreferences and SQLite (sqflite)",
        "Build a weather or news app with API",
      ],
      advanced: [
        "BLoC pattern for complex state",
        "Flutter performance: reduce rebuilds, const widgets",
        "Platform channels for native iOS/Android code",
        "Firebase integration: auth, Firestore, FCM",
        "Testing: unit, widget, and integration tests",
        "CI/CD for Flutter with Fastlane",
        "Build and publish a production Flutter app",
      ],
    },
    kotlin: {
      beginner: [
        "Kotlin setup (IntelliJ / Android Studio), syntax basics",
        "Variables (val/var), types, and null safety",
        "Functions, lambdas, and higher-order functions",
        "Collections: List, Set, Map, and sequences",
        "OOP: classes, data classes, sealed classes",
        "Coroutines basics: launch, async, suspend",
        "Build a simple Android app with Kotlin",
      ],
      intermediate: [
        "Android Jetpack: ViewModel, LiveData, Room",
        "Coroutines Flow for reactive streams",
        "Retrofit for REST API calls on Android",
        "Dependency injection with Hilt",
        "Navigation Component for multi-screen apps",
        "Jetpack Compose basics: composables and state",
        "Build a multi-screen Android app",
      ],
      advanced: [
        "Advanced Jetpack Compose: performance and animation",
        "Kotlin Multiplatform (KMP) for shared business logic",
        "Android architecture: Clean Architecture + MVVM",
        "Testing: JUnit5, MockK, and Compose testing",
        "Performance: profiling with Android Studio",
        "Publishing to Google Play: signing, release, review",
        "Build a production-quality Android app",
      ],
    },
    swift: {
      beginner: [
        "Swift syntax: variables, constants, optionals, and control flow",
        "Functions, closures, and type inference",
        "OOP: classes, structs, and enums",
        "Collections: Array, Dictionary, and Set",
        "Error handling with try/catch",
        "Xcode basics and building your first iOS app",
        "Build a simple UI app with UIKit or SwiftUI",
      ],
      intermediate: [
        "SwiftUI: views, modifiers, and state management",
        "Combine framework for reactive programming",
        "Networking: URLSession and async/await",
        "Core Data for local persistence",
        "Navigation and sheet presentations in SwiftUI",
        "MVVM architecture pattern in iOS",
        "Build a full iOS app with API integration",
      ],
      advanced: [
        "Swift concurrency: actors, async sequences",
        "Performance optimization: instruments and profiling",
        "Custom framework development",
        "ARKit or CoreML integration",
        "App Store submission and TestFlight",
        "Testing: XCTest and UI testing",
        "Build and publish a production iOS app",
      ],
    },
    rust: {
      beginner: [
        "Rust setup, cargo, and Hello World",
        "Variables, mutability, and basic data types",
        "Ownership, borrowing, and lifetimes (core concept)",
        "Functions, closures, and pattern matching",
        "Structs, enums, and impl blocks",
        "Error handling: Result<T,E> and Option<T>",
        "Build a simple CLI tool with Rust",
      ],
      intermediate: [
        "Traits and generics for reusable code",
        "Collections: Vec, HashMap, and iterators",
        "Concurrency: threads, Arc, Mutex",
        "Async Rust with tokio",
        "File I/O and working with the standard library",
        "Writing and running tests in Rust",
        "Build a REST API or file processing tool",
      ],
      advanced: [
        "Advanced lifetimes and lifetime elision",
        "Smart pointers: Box, Rc, RefCell",
        "Unsafe Rust: when and why",
        "WebAssembly with Rust (wasm-pack)",
        "Macros: declarative and procedural",
        "Performance profiling with flamegraph and criterion",
        "Build a systems tool or CLI used in production",
      ],
    },
    golang: {
      beginner: [
        "Go setup, workspace, go.mod, and Hello World",
        "Variables, constants, basic types, and control flow",
        "Functions, multiple return values, and named returns",
        "Arrays, slices, maps, and range loops",
        "Structs, methods, and interfaces",
        "Error handling idiom: error as a return value",
        "Build a simple CLI tool or basic HTTP server",
      ],
      intermediate: [
        "Goroutines and channels for concurrency",
        "Select statement and channel patterns",
        "Context package for cancellation and timeouts",
        "Standard library: net/http, encoding/json, os",
        "Testing with the testing package and testify",
        "Building a REST API with Go + database",
        "Dependency management with Go modules",
      ],
      advanced: [
        "Advanced concurrency patterns: worker pools, fan-out/in",
        "Memory model and data race detection",
        "Performance profiling with pprof",
        "gRPC services with protobuf in Go",
        "Build scalable microservices with Go",
        "Generics (Go 1.18+): type parameters and constraints",
        "Production Go service: observability, graceful shutdown",
      ],
    },
  };

  const genericByLevel = {
    beginner: [
      `Setup ${subject}: tools, environment, and first "hello world"`,
      `${subject} fundamentals: core terms + 3 simple examples`,
      `${subject} practice day: implement a tiny exercise (30-45 min)`,
      `${subject} common patterns: inputs, outputs, and step-by-step workflow`,
      `${subject} micro project: build one small working feature`,
      `${subject} troubleshooting: errors you will likely hit + fixes`,
      `${subject} review: recap notes + mini-quiz (10 questions)`,
    ],
    intermediate: [
      `${subject} deep concepts: key mechanisms + real examples`,
      `${subject} guided practice: implement 2 realistic exercises`,
      `${subject} debugging day: read logs/errors + refactor improvements`,
      `${subject} best practices: structure, conventions, and clean design`,
      `${subject} mini project: build a feature-complete module`,
      `${subject} optimization: speed/quality improvements + trade-offs`,
      `${subject} assessment: targeted review on weak areas + redo exercises`,
    ],
    advanced: [
      `${subject} advanced internals: design trade-offs + architecture`,
      `${subject} expert practice: solve harder cases + edge conditions`,
      `${subject} performance/scaling: profile bottlenecks and optimize`,
      `${subject} production patterns: reliability, validation, and resilience`,
      `${subject} deep debugging: reproduce, instrument, and fix root causes`,
      `${subject} advanced milestone: deliver a polished project iteration`,
      `${subject} expert review: quality checklist + improvement plan`,
    ],
  };

  const subjectBank = banks[s];
  if (subjectBank && subjectBank[level]) return subjectBank[level];
  return genericByLevel[level] || genericByLevel.intermediate;
}

function buildFallbackStudyPlan({ subjects, difficulty, goals }) {
  const selectedSubjects = Array.isArray(subjects) && subjects.length ? subjects : ["General Study"];
  const dailyMinutes = Number(goals?.studyTimePerDayMinutes) > 0 ? Number(goals.studyTimePerDayMinutes) : 60;
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const topicBanks = selectedSubjects.reduce((acc, subject) => {
    acc[subject] = getTopicBankForSubject(subject, difficulty);
    return acc;
  }, {});

  const weeklySchedule = weekdays.map((day, idx) => {
    // Include topics for *all* user-selected subjects across the full week.
    // UI will render the whole focusTopics list, so the user sees everything they typed.
    const focusTopics = selectedSubjects.flatMap((subject, sIdx) => {
      const topicBank = topicBanks[subject] || [];
      const topic = topicBank[(idx + sIdx) % 7] || `${subject}: practical learning block`;
      return [
        topic,
        `${subject}: hands-on exercise (${day})`,
        `${subject}: mini assessment + recap (${day})`,
      ];
    });
    return {
      weekDay: day,
      subjects: [...selectedSubjects],
      focusTopics,
      timeMinutes: dailyMinutes,
    };
  });

  return {
    title: `${difficulty || "Balanced"} ${selectedSubjects[0]} Study Plan`,
    weeklySchedule,
    milestones: [
      {
        name: "Foundation checkpoint",
        targetDateHint: "End of Week 1",
        successCriteria: [
          "Complete at least 5 focused sessions",
          "Summarize key concepts in your own words",
        ],
      },
      {
        name: "Practice consistency",
        targetDateHint: "End of Week 2",
        successCriteria: [
          "Solve 2 practice sets per subject",
          "Track weak areas and review them once",
        ],
      },
    ],
    weaknessChecks: selectedSubjects.map((subject) => ({
      topic: subject,
      howToAssess: "Do a 15-minute timed quiz and review mistakes.",
      whatToDoIfWeak: "Revisit basics, then repeat one focused practice set.",
    })),
    generatedBy: "fallback",
  };
}

function buildFallbackFlashcards({ topic, count }) {
  const n = Math.min(count || 8, 12);
  const banks = {
    python: [
      { front: "What is a Python list comprehension?", back: "A concise way to create lists: [expr for item in iterable if condition]. Example: [x*2 for x in range(10) if x % 2 == 0]" },
      { front: "What does the `zip()` function do?", back: "Combines two or more iterables element-by-element into tuples. Example: zip([1,2,3], ['a','b','c']) → [(1,'a'), (2,'b'), (3,'c')]" },
      { front: "What is the difference between `is` and `==`?", back: "`==` checks value equality; `is` checks object identity (same memory address). Always use `==` for value comparisons." },
      { front: "What is a decorator in Python?", back: "A function that wraps another function to add behavior without changing its source code. Written with @decorator_name above the function." },
      { front: "What does `*args` and `**kwargs` do?", back: "`*args` collects extra positional arguments as a tuple; `**kwargs` collects keyword arguments as a dict. Used for flexible function signatures." },
      { front: "What is the GIL in Python?", back: "Global Interpreter Lock — a mutex that prevents multiple threads from executing Python bytecode simultaneously in CPython, limiting CPU-bound parallelism." },
      { front: "What is the difference between a list and a tuple?", back: "Lists are mutable (can be changed after creation); tuples are immutable (fixed). Tuples are faster and used for fixed collections like coordinates." },
      { front: "What is a generator in Python?", back: "A function that uses `yield` to return values one at a time, generating them lazily. Uses less memory than building an entire list. Example: (x**2 for x in range(1000))" },
    ],
    javascript: [
      { front: "What is the difference between `let`, `const`, and `var`?", back: "`var` is function-scoped and hoisted to the top; `let` and `const` are block-scoped. `const` prevents reassignment (but objects can still be mutated)." },
      { front: "What is a closure in JavaScript?", back: "A function that retains access to its outer scope's variables even after the outer function has returned. Used for data privacy and factory functions." },
      { front: "What does `===` do vs `==`?", back: "`===` checks value AND type (strict equality, no type coercion); `==` coerces types first. Always prefer `===` to avoid unexpected comparisons." },
      { front: "What is the JavaScript event loop?", back: "A mechanism that allows JS (single-threaded) to handle async code by processing the call stack, then the microtask queue (Promises), then the macrotask queue (setTimeout)." },
      { front: "What is a Promise?", back: "An object representing the eventual completion or failure of an async operation. Has three states: pending, fulfilled, rejected. Use .then()/.catch() or async/await." },
      { front: "What is event bubbling?", back: "When an event fires on a child element, it 'bubbles up' to parent elements. Use event.stopPropagation() to prevent it, or event delegation to handle it efficiently." },
      { front: "What is `this` in JavaScript?", back: "Refers to the calling object. In regular functions, it depends on the call site. In arrow functions, `this` is lexically inherited from the enclosing scope." },
      { front: "What is the difference between `null` and `undefined`?", back: "`undefined` means a variable was declared but not assigned. `null` is an intentional empty value explicitly assigned by the developer." },
    ],
    typescript: [
      { front: "What is the difference between `interface` and `type` in TypeScript?", back: "Both define shapes, but `interface` supports declaration merging and is preferred for objects. `type` is more flexible — supports unions, intersections, and mapped types." },
      { front: "What are generics in TypeScript?", back: "Type parameters that make functions/classes work with any type while maintaining type safety. Example: function identity<T>(arg: T): T { return arg; }" },
      { front: "What is a union type?", back: "A type that can be one of several types. Example: type StringOrNumber = string | number. TypeScript narrows the type through type guards." },
      { front: "What is `Partial<T>` utility type?", back: "Makes all properties of T optional. Useful for update functions where you don't need every field. Example: Partial<User> makes all User properties optional." },
      { front: "What does `readonly` do in TypeScript?", back: "Marks a property as immutable after initialization — it cannot be reassigned. TypeScript will throw a compile error if you try to change it." },
      { front: "What is a type guard?", back: "A runtime check that narrows a union type. Examples: typeof, instanceof, or custom type predicates (function isString(x: any): x is string)." },
      { front: "What is `never` type?", back: "Represents a value that never occurs — used for functions that always throw or have infinite loops. Also the bottom type in TypeScript's type system." },
      { front: "What are discriminated unions?", back: "A union of types that each have a common literal property (discriminant) used to narrow the type. Example: {kind: 'circle', radius: number} | {kind: 'square', side: number}" },
    ],
    react: [
      { front: "What is the difference between state and props?", back: "Props are read-only data passed from parent to child. State is local, mutable data owned by a component that triggers re-renders when changed." },
      { front: "What does useEffect do?", back: "Runs side effects after render. Accepts a callback and a dependency array. An empty array [] means run once on mount. Return a function to clean up." },
      { front: "What is the Virtual DOM?", back: "A lightweight JavaScript representation of the real DOM. React compares (diffs) it against the previous version and only updates what changed — making updates efficient." },
      { front: "What is a custom hook?", back: "A JavaScript function starting with 'use' that can call other hooks. Used to extract and reuse stateful logic between components without changing the component tree." },
      { front: "What is useMemo used for?", back: "Memoizes an expensive computed value so it's only recalculated when its dependencies change. Avoids unnecessary recalculations on every render." },
      { front: "What is the key prop and why is it needed?", back: "A unique identifier for list items that helps React efficiently identify which items changed. Without a stable key, React can't correctly reorder or update list items." },
      { front: "What is React Context?", back: "A way to share data across the component tree without passing props at every level. Best for global data like theme, auth, or language. Use sparingly to avoid re-render issues." },
      { front: "What is the difference between useCallback and useMemo?", back: "useCallback memoizes a function reference; useMemo memoizes a computed value. Both take a dependency array. Use them to prevent unnecessary re-renders in child components." },
    ],
    sql: [
      { front: "What is the difference between INNER JOIN and LEFT JOIN?", back: "INNER JOIN returns rows where there's a match in BOTH tables. LEFT JOIN returns ALL rows from the left table, and matching rows from the right (NULL if no match)." },
      { front: "What is a window function?", back: "A function that performs a calculation across rows related to the current row without collapsing them. Examples: ROW_NUMBER(), RANK(), LAG(), SUM() OVER (PARTITION BY ...)" },
      { front: "What is the difference between WHERE and HAVING?", back: "WHERE filters rows BEFORE aggregation. HAVING filters AFTER aggregation (used with GROUP BY). Example: HAVING COUNT(*) > 5 filters groups." },
      { front: "What is an index and why use one?", back: "A data structure that speeds up queries by allowing faster lookups. Trade-off: faster reads but slower writes. Best on frequently-filtered or joined columns." },
      { front: "What is a CTE (Common Table Expression)?", back: "A temporary named result set defined with WITH that you can reference in the main query. Makes complex queries more readable. Can be recursive." },
      { front: "What does ACID stand for in databases?", back: "Atomicity (all or nothing), Consistency (data stays valid), Isolation (concurrent transactions don't interfere), Durability (committed data persists). Guarantees reliable transactions." },
      { front: "What is a subquery?", back: "A query nested inside another query. Can appear in SELECT, FROM, or WHERE. A correlated subquery references the outer query and runs once per row." },
      { front: "What is normalization?", back: "Organizing a database to reduce data redundancy and improve integrity. Normal forms (1NF, 2NF, 3NF) progressively eliminate duplication and dependency anomalies." },
    ],
    dsa: [
      { front: "What is the time complexity of binary search?", back: "O(log n) — it halves the search space with each step. Requires a sorted array. Compare mid element and eliminate half accordingly." },
      { front: "What is a hash table?", back: "A data structure using a hash function to map keys to bucket indices, giving O(1) average lookup. Collisions handled via chaining or open addressing." },
      { front: "What is the difference between BFS and DFS?", back: "BFS (Breadth-First Search) explores level by level using a queue — good for shortest paths. DFS (Depth-First Search) explores depth-first using a stack/recursion — good for path existence." },
      { front: "What is dynamic programming?", back: "Breaking a problem into overlapping subproblems, solving each once, and storing results (memoization or tabulation). Key insight: optimal substructure + overlapping subproblems." },
      { front: "What is Big-O notation?", back: "Describes the worst-case time or space complexity as input grows. Common examples: O(1) constant, O(log n) binary search, O(n) linear scan, O(n²) nested loops." },
      { front: "What is a sliding window technique?", back: "Maintains a window of elements over an array/string, expanding or shrinking from both ends. Turns O(n²) brute-force solutions into O(n). Used for subarray/substring problems." },
      { front: "What is the two-pointer technique?", back: "Uses two pointers (usually start and end) that move toward each other or in the same direction. Efficiently solves sorted array problems like pair sum, removing duplicates." },
      { front: "What is a heap data structure?", back: "A complete binary tree satisfying the heap property: max-heap (parent ≥ children) or min-heap (parent ≤ children). Supports O(log n) insert/extract. Used for priority queues." },
    ],
    java: [
      { front: "What is the difference between `==` and `.equals()` in Java?", back: "`==` compares references (memory addresses) for objects; `.equals()` compares content. Always use `.equals()` for String and object value comparisons." },
      { front: "What is the Java Collections Framework?", back: "A set of interfaces (List, Set, Map, Queue) and implementations (ArrayList, HashMap, HashSet, LinkedList) for storing and manipulating groups of objects." },
      { front: "What is the difference between ArrayList and LinkedList?", back: "ArrayList uses a dynamic array — fast random access O(1), slow insert/delete O(n). LinkedList uses nodes — fast insert/delete O(1), slow access O(n)." },
      { front: "What are Java Streams?", back: "A pipeline API (Java 8+) for processing collections with filter, map, reduce, collect, and more. Supports lazy evaluation and can be parallelized." },
      { front: "What is the purpose of the `final` keyword?", back: "On a variable: prevents reassignment. On a method: prevents overriding. On a class: prevents subclassing. Makes code safer and communicates intent." },
      { front: "What is an interface in Java?", back: "A contract that classes can implement, specifying methods they must provide. Supports multiple implementation (unlike single inheritance). Java 8+ allows default methods." },
      { front: "What is checked vs unchecked exception?", back: "Checked exceptions (e.g., IOException) must be declared or caught. Unchecked (runtime) exceptions (e.g., NullPointerException) don't need to be explicitly handled." },
      { front: "What is garbage collection in Java?", back: "Automatic memory management — the JVM identifies and frees objects no longer referenced. Reduces memory leaks but can cause pauses. Tunable via JVM flags." },
    ],
    cpp: [
      { front: "What is a pointer in C++?", back: "A variable that stores the memory address of another variable. Declared with *, dereferenced with *. Enables dynamic memory and passing by reference." },
      { front: "What is the difference between stack and heap memory?", back: "Stack memory is automatically managed — fast, limited, local variables. Heap memory is dynamically allocated (new/delete), larger, but must be manually freed to avoid leaks." },
      { front: "What are smart pointers?", back: "RAII wrappers that manage heap memory automatically: unique_ptr (single owner), shared_ptr (reference counted), weak_ptr (non-owning). Prevent memory leaks." },
      { front: "What is RAII in C++?", back: "Resource Acquisition Is Initialization — resources (memory, files, locks) are tied to object lifetime. Acquired in constructor, released in destructor. Prevents resource leaks." },
      { front: "What is the difference between `struct` and `class` in C++?", back: "Only difference: struct members are public by default; class members are private by default. Both support inheritance, methods, and constructors." },
      { front: "What are templates in C++?", back: "A mechanism for generic programming — write code that works with any type. Function templates and class templates allow type-independent algorithms and data structures." },
      { front: "What is move semantics?", back: "C++11 feature that transfers ownership of resources instead of copying. Uses rvalue references (&&). Makes returning heavy objects from functions very efficient." },
      { front: "What is a virtual function?", back: "A member function declared with `virtual` that can be overridden in subclasses. Enables runtime polymorphism — the correct function is called based on the actual object type." },
    ],
    systemdesign: [
      { front: "What is horizontal vs vertical scaling?", back: "Vertical scaling (scale up) adds more CPU/RAM to one machine. Horizontal scaling (scale out) adds more machines. Horizontal is preferred for fault tolerance and large scale." },
      { front: "What is a load balancer?", back: "Distributes incoming requests across multiple servers to prevent overload. Can use algorithms like round-robin, least connections, or IP hash. Improves availability and throughput." },
      { front: "What is the CAP theorem?", back: "A distributed system can only guarantee 2 of 3: Consistency (same data everywhere), Availability (always responds), Partition tolerance (survives network splits). CP or AP trade-off." },
      { front: "What is caching and when should you use it?", back: "Storing frequently accessed data in fast memory (Redis, Memcached) to reduce DB load and latency. Best for read-heavy, slowly-changing data. Risks: stale data, cache invalidation." },
      { front: "What is a message queue?", back: "Middleware that decouples producers and consumers. Messages are stored until consumed. Enables async processing, retries, and load buffering. Examples: Kafka, RabbitMQ, SQS." },
      { front: "What is database sharding?", back: "Horizontally partitioning data across multiple databases (shards) based on a shard key. Allows scaling beyond a single DB. Trade-offs: complexity, cross-shard queries are hard." },
      { front: "What is a CDN?", back: "Content Delivery Network — geographically distributed servers that cache static content (images, JS, CSS) close to users, reducing latency and origin server load." },
      { front: "What is eventual consistency?", back: "A consistency model where replicas will converge to the same state eventually (not immediately). Used in high-availability systems like DynamoDB and Cassandra." },
    ],
    ml: [
      { front: "What is the difference between supervised and unsupervised learning?", back: "Supervised: trained on labeled data to predict outputs (classification, regression). Unsupervised: finds patterns in unlabeled data (clustering, dimensionality reduction)." },
      { front: "What is overfitting?", back: "When a model learns training data too well — including noise — and fails to generalize to new data. Detected by high training accuracy but low validation accuracy." },
      { front: "What is gradient descent?", back: "An optimization algorithm that iteratively adjusts model parameters in the direction that minimizes the loss function. Step size is controlled by the learning rate." },
      { front: "What is cross-validation?", back: "Technique to evaluate a model by training and testing on different subsets. K-fold CV splits data into k folds, trains k times each using a different fold as test set." },
      { front: "What is regularization?", back: "Techniques that penalize model complexity to reduce overfitting: L1 (Lasso, promotes sparsity), L2 (Ridge, shrinks weights), Dropout (for neural networks)." },
      { front: "What is the bias-variance tradeoff?", back: "Bias = error from wrong assumptions (underfitting). Variance = sensitivity to small fluctuations (overfitting). Goal: find a model complex enough to be accurate but not overfit." },
      { front: "What is precision vs recall?", back: "Precision = TP/(TP+FP) — of all predicted positives, how many were correct? Recall = TP/(TP+FN) — of all actual positives, how many did we find? Trade-off in classification." },
      { front: "What is a confusion matrix?", back: "A table showing TP, FP, TN, FN counts for a classification model. Reveals what type of errors the model makes. Basis for precision, recall, and F1-score metrics." },
    ],
    docker: [
      { front: "What is the difference between a Docker image and a container?", back: "An image is a read-only template (like a class). A container is a running instance of an image (like an object). Multiple containers can run from the same image." },
      { front: "What does COPY vs ADD do in a Dockerfile?", back: "COPY copies local files into the image. ADD also supports URL sources and auto-extracts tar archives. Prefer COPY for clarity unless you need ADD's extra features." },
      { front: "What is a multi-stage build?", back: "A Dockerfile with multiple FROM stages — early stages compile/build, later stages copy only the artifacts needed. Dramatically reduces final image size." },
      { front: "What is a Docker volume?", back: "Persistent storage that exists outside the container lifecycle. Survives container restarts and deletion. Used for databases and shared data between containers." },
      { front: "What does `docker-compose up` do?", back: "Reads docker-compose.yml and starts all defined services (containers, networks, volumes). `--build` rebuilds images. `-d` runs in detached (background) mode." },
      { front: "What is a Docker registry?", back: "A storage and distribution system for Docker images. Docker Hub is the default public registry. Private registries (ECR, GCR, Harbor) are used for production images." },
      { front: "What does CMD vs ENTRYPOINT do?", back: "ENTRYPOINT defines the main executable (not overridable without --entrypoint flag). CMD provides default arguments. Together: ENTRYPOINT for the command, CMD for default args." },
      { front: "How does Docker networking work?", back: "Containers communicate via virtual networks. Default bridge network isolates containers. Services in the same docker-compose file share a network and can reach each other by service name." },
    ],
    linux: [
      { front: "What does `chmod 755` mean?", back: "Sets permissions: 7 (rwx) for owner, 5 (r-x) for group, 5 (r-x) for others. Binary: 111 101 101. Use chmod +x file to just add execute permission." },
      { front: "What is a pipe `|` in Linux?", back: "Connects the stdout of one command to the stdin of the next. Example: cat file.txt | grep 'error' | wc -l counts error lines. Chains multiple commands." },
      { front: "What does `grep -r 'pattern' .` do?", back: "Recursively searches all files in the current directory for lines matching 'pattern'. Add -i for case-insensitive, -n for line numbers, -l for filenames only." },
      { front: "What is a cron job?", back: "A scheduled task that runs at specified times using the cron daemon. Configured with crontab -e. Format: minute hour day month weekday command." },
      { front: "What is the difference between `>` and `>>` in bash?", back: "`>` redirects output and overwrites the file. `>>` appends to the file. Both redirect stdout. `2>` redirects stderr; `2>&1` merges stderr into stdout." },
      { front: "What does `ps aux` show?", back: "Lists all running processes for all users with details: PID, CPU/memory usage, start time, command. `ps aux | grep nginx` finds a specific process." },
      { front: "What is a symbolic link (symlink)?", back: "A pointer to another file or directory (like a shortcut). Created with `ln -s target linkname`. Changes to the target are reflected through the symlink." },
      { front: "What is the difference between `kill` and `kill -9`?", back: "`kill PID` sends SIGTERM (15) — a graceful shutdown request that the process can handle. `kill -9 PID` sends SIGKILL — forcefully terminates immediately, no cleanup." },
    ],
    networking: [
      { front: "What are the 7 layers of the OSI model?", back: "Physical, Data Link, Network, Transport, Session, Presentation, Application. Remember: 'Please Do Not Throw Sausage Pizza Away'. TCP/IP model combines several layers." },
      { front: "What is the difference between TCP and UDP?", back: "TCP: connection-oriented, reliable, ordered delivery, flow control. Slower but guaranteed. UDP: connectionless, no guarantee, fast. Used for video, DNS, gaming." },
      { front: "What is DNS?", back: "Domain Name System — translates human-readable domain names (google.com) to IP addresses. Uses a hierarchy: recursive resolver → root → TLD → authoritative nameserver." },
      { front: "What happens during a TCP 3-way handshake?", back: "Client sends SYN → Server responds SYN-ACK → Client sends ACK. Establishes a connection before data transfer. Closing uses a 4-way FIN exchange." },
      { front: "What is a subnet mask?", back: "Defines which part of an IP address is the network and which is the host. Example: 255.255.255.0 (or /24) means 24 bits for network, 8 bits for hosts (254 usable addresses)." },
      { front: "What is HTTP vs HTTPS?", back: "HTTP sends data in plaintext. HTTPS encrypts data using TLS (Transport Layer Security). TLS provides authentication (certificates), encryption, and integrity." },
      { front: "What is the difference between a router and a switch?", back: "A switch connects devices within the same network (Layer 2, MAC addresses). A router connects different networks and forwards packets between them (Layer 3, IP addresses)." },
      { front: "What is NAT (Network Address Translation)?", back: "Maps private IP addresses to a public IP. Allows multiple devices on a private network to share one public IP. Also provides basic security by hiding internal IPs." },
    ],
    cybersecurity: [
      { front: "What is SQL injection?", back: "An attack where malicious SQL code is injected into a query via user input. Example: ' OR '1'='1. Prevented by parameterized queries/prepared statements — never concatenate user input." },
      { front: "What is XSS (Cross-Site Scripting)?", back: "Injecting malicious scripts into web pages viewed by other users. Stored XSS saves the payload in the DB; Reflected XSS reflects it in the response. Prevented by output encoding." },
      { front: "What is CSRF (Cross-Site Request Forgery)?", back: "Tricks a logged-in user's browser into making unintended requests to the target site. Prevented by CSRF tokens, SameSite cookies, and checking Origin/Referer headers." },
      { front: "What is the difference between authentication and authorization?", back: "Authentication (authn): verifying who you are (login, password, MFA). Authorization (authz): verifying what you're allowed to do (permissions, roles). AuthN comes first." },
      { front: "What is hashing vs encryption?", back: "Hashing is one-way (bcrypt, SHA-256) — cannot be reversed. Used for passwords. Encryption is two-way — can be decrypted with the key. Used for data that needs to be recovered." },
      { front: "What is a Man-in-the-Middle (MITM) attack?", back: "An attacker secretly intercepts and possibly modifies communication between two parties. Prevented by TLS/HTTPS, certificate pinning, and verifying certificates." },
      { front: "What is the principle of least privilege?", back: "Users, programs, and systems should have only the minimum permissions needed to do their job. Limits damage from compromised accounts or buggy code." },
      { front: "What is a CVE?", back: "Common Vulnerabilities and Exposures — a publicly disclosed cybersecurity vulnerability with a unique identifier (e.g., CVE-2021-44228 for Log4Shell). Used to track and patch vulnerabilities." },
    ],
    git: [
      { front: "What is the difference between `git merge` and `git rebase`?", back: "Merge creates a merge commit, preserving full history. Rebase replays commits onto another branch, creating a linear history. Rebase rewrites history — don't use on shared branches." },
      { front: "What does `git stash` do?", back: "Saves uncommitted changes (staged and unstaged) to a temporary stack so you can switch branches. `git stash pop` restores them. `git stash list` shows all stashes." },
      { front: "What is a detached HEAD state?", back: "Occurs when HEAD points to a specific commit instead of a branch. Changes made won't belong to any branch and may be lost. Create a new branch to save your work." },
      { front: "What does `git cherry-pick` do?", back: "Applies a specific commit from another branch to the current branch. Useful for picking one fix without merging an entire branch." },
      { front: "What is `git reflog`?", back: "Records all changes to HEAD — even after resets, rebases, and deletes. Your safety net for recovering 'lost' commits. Use git checkout <hash> to restore them." },
      { front: "What is the difference between `git fetch` and `git pull`?", back: "`git fetch` downloads remote changes without merging. `git pull` = git fetch + git merge. Prefer fetch+review before merging to avoid surprises." },
      { front: "What is a `.gitignore` file?", back: "Specifies files/directories Git should not track. Use patterns like *.log, node_modules/, .env. A file already tracked must be explicitly removed with git rm --cached." },
      { front: "What does `git reset --hard` do?", back: "Moves HEAD and the branch pointer to a commit AND discards all changes in the working directory and index. Destructive — use carefully. Use --soft to keep changes staged." },
    ],
    nodejs: [
      { front: "What is the Node.js event loop?", back: "A loop that processes async operations: executes call stack, then microtasks (Promises), then timers (setTimeout), then I/O callbacks. Enables non-blocking I/O in single-threaded Node." },
      { front: "What is middleware in Express.js?", back: "A function that has access to req, res, and next(). Can modify the request, end the response, or call next() to pass control. Used for auth, logging, parsing, error handling." },
      { front: "What is the difference between `require` and `import`?", back: "`require` is CommonJS (synchronous, runtime). `import` is ES Modules (static, compile-time). Node.js supports both, but ESM requires .mjs extension or 'type': 'module' in package.json." },
      { front: "What does `process.env` give you?", back: "Access to environment variables — configuration that changes between environments (dev, staging, prod). Never hardcode secrets in code; use .env files with dotenv in development." },
      { front: "What are Node.js streams?", back: "Objects for reading/writing data piece by piece (chunks) instead of loading everything into memory. Types: Readable, Writable, Duplex, Transform. Used for files, HTTP requests." },
      { front: "What is the purpose of `package-lock.json`?", back: "Locks the exact version of every installed dependency (including nested deps) for reproducible installs across machines. Should be committed to version control." },
      { front: "What is clustering in Node.js?", back: "Running multiple Node.js processes (workers) that share the same port, utilizing multiple CPU cores. The cluster module forks child processes that communicate via IPC." },
      { front: "What is CORS and how do you enable it in Express?", back: "Cross-Origin Resource Sharing — a browser security policy blocking cross-origin requests by default. In Express: use `app.use(cors())` from the cors package to allow specified origins." },
    ],
    htmlcss: [
      { front: "What is the CSS Box Model?", back: "Every element is a box: content → padding → border → margin. `box-sizing: border-box` includes padding and border in the width calculation (recommended for layouts)." },
      { front: "What is the difference between Flexbox and Grid?", back: "Flexbox is one-dimensional (row OR column). Grid is two-dimensional (rows AND columns). Use Flexbox for components/nav bars; use Grid for page layouts." },
      { front: "What is a CSS pseudo-class?", back: "Selects elements in a special state: :hover, :focus, :nth-child(), :first-child, :not(). Example: button:hover { background: blue } styles the button when hovered." },
      { front: "What is the difference between `em` and `rem`?", back: "`em` is relative to the parent element's font size. `rem` is relative to the root (html) element's font size. Use `rem` for consistent, predictable sizing." },
      { front: "What is CSS specificity?", back: "Determines which CSS rule wins when multiple rules apply. Order: inline styles > IDs > classes/pseudo-classes > elements. Calculate as (0,1,0,0) for ID, (0,0,1,0) for class." },
      { front: "What does `position: absolute` do?", back: "Removes the element from normal flow and positions it relative to its nearest positioned ancestor (with position other than static). Use with top, left, right, bottom." },
      { front: "What is a CSS media query?", back: "Applies styles based on screen size or device characteristics. Example: @media (max-width: 768px) { ... } targets mobile screens. Foundation of responsive design." },
      { front: "What is the `z-index` property?", back: "Controls the stacking order of positioned elements. Higher z-index appears on top. Only works on positioned elements (relative, absolute, fixed, sticky). Default is auto." },
    ],
    devops: [
      { front: "What is CI/CD?", back: "Continuous Integration: automatically build and test code on every commit. Continuous Delivery/Deployment: automatically deploy to staging or production after tests pass." },
      { front: "What is Infrastructure as Code (IaC)?", back: "Managing infrastructure (servers, networks, databases) through code (Terraform, CloudFormation) rather than manual configuration. Enables version control, repeatability, and automation." },
      { front: "What is a Kubernetes Pod?", back: "The smallest deployable unit in Kubernetes — wraps one or more containers that share network and storage. Pods are ephemeral; use Deployments to manage their lifecycle." },
      { front: "What is a Kubernetes Service?", back: "An abstract way to expose a set of Pods as a network service. Types: ClusterIP (internal), NodePort (external via node), LoadBalancer (cloud load balancer), ExternalName." },
      { front: "What is Terraform?", back: "An IaC tool using HCL (HashiCorp Config Language) to define infrastructure across cloud providers. Plan shows what will change; apply executes it. State file tracks current infra." },
      { front: "What is the purpose of a reverse proxy?", back: "Sits in front of servers and forwards requests. Used for SSL termination, load balancing, caching, and hiding internal architecture. Nginx and HAProxy are common reverse proxies." },
      { front: "What is a Helm chart?", back: "A package of pre-configured Kubernetes resources (YAML templates). Helm is Kubernetes' package manager — it simplifies deploying complex applications with configurable values." },
      { front: "What is observability?", back: "The ability to understand a system's internal state from external outputs. The three pillars: Metrics (quantitative measurements), Logs (events), Traces (request flow across services)." },
    ],
    cloud: [
      { front: "What is the difference between IaaS, PaaS, and SaaS?", back: "IaaS: raw infrastructure (EC2, VMs). PaaS: managed platform for deploying apps (Heroku, App Engine). SaaS: ready-to-use software (Gmail, Slack). More managed = less control." },
      { front: "What is an AWS Lambda function?", back: "Serverless compute — runs code in response to events without managing servers. Pay only for execution time. Max 15-minute timeout. Good for event-driven, sporadic workloads." },
      { front: "What is S3 used for?", back: "Amazon Simple Storage Service — object storage for files, images, backups, static websites. Virtually unlimited storage. Offers lifecycle policies, versioning, and access controls." },
      { front: "What is an IAM role?", back: "An AWS identity with permissions that can be assumed by services, users, or applications. Instead of hardcoding credentials, assign roles to EC2/Lambda to access other AWS resources." },
      { front: "What is a VPC?", back: "Virtual Private Cloud — a logically isolated section of AWS. Contains subnets (public/private), route tables, internet gateways, and security groups. Your own private data center in the cloud." },
      { front: "What is Auto Scaling?", back: "Automatically adjusts the number of EC2 instances based on demand. Scale out (add instances) under high load, scale in (remove) under low load. Saves cost and maintains performance." },
      { front: "What is CloudFront?", back: "AWS's CDN (Content Delivery Network) that caches content at edge locations globally. Reduces latency, protects origin servers, and integrates with S3 and EC2." },
      { front: "What is the difference between RDS and DynamoDB?", back: "RDS: managed relational DB (PostgreSQL, MySQL, etc.) — structured data with SQL. DynamoDB: managed NoSQL key-value/document DB — schemaless, auto-scaling, single-digit ms latency." },
    ],
  };

  const topicKey = normalizeSubjectKey(String(topic || ""));
  let cards = [];

  if (banks[topicKey]) {
    cards = banks[topicKey];
  } else {
    for (const [k, v] of Object.entries(banks)) {
      if (topicKey.includes(k) || k.includes(topicKey)) { cards = v; break; }
    }
  }

  if (!cards.length) {
    const topicLabel = String(topic || "this topic");
    cards = [
      { front: `What are the core fundamentals of ${topicLabel}?`, back: `${topicLabel} fundamentals include the core syntax/concepts, data structures or primitives it uses, and how to set up a working environment to practice.` },
      { front: `What is the most common use case for ${topicLabel}?`, back: `${topicLabel} is most commonly used in professional software development to solve real-world problems. Understanding its primary purpose helps you focus your learning.` },
      { front: `What are the key differences between beginner and intermediate ${topicLabel}?`, back: `Beginners focus on syntax and basic patterns. Intermediate practitioners understand performance trade-offs, best practices, and can build full working applications.` },
      { front: `What should you build first when learning ${topicLabel}?`, back: `Start with the simplest working example, then incrementally add features. A CRUD application or CLI tool is a good first project for most technologies.` },
      { front: `How do you debug problems in ${topicLabel}?`, back: `Use the debugger or logging to trace execution. Read error messages carefully. Isolate the problem with minimal reproduction. Search official docs and Stack Overflow.` },
      { front: `What are the best resources for learning ${topicLabel}?`, back: `Official documentation is always the most authoritative. Supplement with structured tutorials, hands-on practice projects, and community forums like Stack Overflow and Reddit.` },
      { front: `What are common mistakes when learning ${topicLabel}?`, back: `Over-relying on tutorials without building independently, not reading error messages carefully, and skipping fundamentals to jump to advanced topics prematurely.` },
      { front: `How does ${topicLabel} fit into a professional tech career?`, back: `${topicLabel} skills are valued in software engineering roles. Build projects that demonstrate your skills, and document them on GitHub to show recruiters practical experience.` },
    ];
  }

  return cards.slice(0, n);
}

async function generateFlashcards({ userId, topic, count = 8 }) {
  const systemPrompt = `You are FocusPath AI, a study flashcard generator. Generate exactly ${count} high-quality flashcards for the topic the user provides.

Rules:
- Questions MUST be SPECIFIC to the exact topic — not generic study questions.
- Answers must be accurate, clear, and 1-3 sentences.
- Cover a range from foundational to more advanced concepts.
- Include real examples, code snippets, or formulas where they help.
- Return ONLY a valid JSON array — no explanation text, no markdown fences.`;

  const userPrompt = `Generate exactly ${count} flashcards for: "${topic}"

Return ONLY valid JSON array:
[
  { "front": "Specific question about ${topic}", "back": "Clear accurate answer with example if helpful" }
]

Cover these aspects of ${topic}:
1. Core definition/concept
2. Key syntax or usage (with example)
3. Important differences or comparisons
4. Common mistake or gotcha
5. Real-world use case
6-${count}. Other important specific concepts

Make every question directly about ${topic}. Do not write generic questions.`;

  const raw = await chat({ systemPrompt, userPrompt, temperature: 0.5 });
  const parsed = tryParseJson(raw);
  await logAi({ userId, type: "flashcards", prompt: userPrompt, response: raw });

  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].front && parsed[0].back) {
    return parsed.slice(0, count);
  }
  return buildFallbackFlashcards({ topic, count });
}

async function logAi({ userId, type, prompt, response }) {
  if (DEMO_MODE) {
    mem.addAiLog(userId, type, prompt, response);
    return;
  }
  const delegate = prisma.AI_Logs || prisma.aI_Logs;
  if (!delegate) throw new Error("Prisma AI_Logs delegate not found");

  return delegate.create({
    data: {
      userId,
      type,
      prompt,
      response,
    },
  });
}

async function generateStudyPlan({ userId, subjects, difficulty, goals }) {
  const subjectList = Array.isArray(subjects) ? subjects.join(", ") : subjects;
  const level = difficulty || "intermediate";

  const systemPrompt = `You are FocusPath AI, an expert study planner. Generate a precise, real 7-day study plan as JSON.

Critical rules:
- Every focus topic MUST be a REAL, SPECIFIC topic name for that subject — NOT a generic placeholder.
- Examples of GOOD topics: "Python list comprehensions, generators, and iterators", "React useEffect hook and side effects", "SQL window functions ROW_NUMBER and RANK", "Binary search trees: insertion and traversal"
- Examples of BAD topics: "Python practice", "Study React", "Exercise day", "Review"
- Tailor topics to the EXACT difficulty level: ${level}
- Generate topics that PROGRESSIVELY build on each other across the week
- Return ONLY valid JSON — no explanation text`;

  const userPrompt = `Generate a complete 7-day study plan.

Subjects to cover: ${subjectList}
Difficulty level: ${level}
Daily study time: ${Number(goals?.studyTimePerDayMinutes) > 0 ? goals.studyTimePerDayMinutes : 60} minutes
User goal: ${goals?.goalText || "master the subjects and build practical skills"}

Return ONLY valid JSON:
{
  "title": "Descriptive plan title that mentions subject and level",
  "weeklySchedule": [
    {
      "weekDay": "Mon",
      "subjects": ["exactly the subject names the user entered"],
      "focusTopics": [
        "Real specific topic 1 for subject 1 at ${level} level",
        "Real specific topic 2 for subject 1 at ${level} level",
        "Real specific topic 1 for subject 2 at ${level} level (if multiple subjects)"
      ],
      "timeMinutes": 60
    }
  ],
  "milestones": [
    { "name": "Milestone name", "targetDateHint": "End of Week 1", "successCriteria": ["specific measurable outcome"] }
  ],
  "weaknessChecks": [
    { "topic": "subject name", "howToAssess": "specific assessment method", "whatToDoIfWeak": "specific remedy action" }
  ]
}

Include ALL 7 days (Mon through Sun). Each day must have 2-4 specific focus topics per subject. Topics must be REAL and SPECIFIC to ${subjectList}.`;

  const raw = await chat({ systemPrompt, userPrompt, temperature: 0.6 });
  const parsed = tryParseJson(raw);

  const responseForLog = parsed ? JSON.stringify(parsed) : raw;
  await logAi({ userId, type: "study_plan", prompt: userPrompt, response: responseForLog });

  if (parsed && Array.isArray(parsed.weeklySchedule)) {
    const selectedSubjects = Array.isArray(subjects) ? subjects : [subjects];
    const normalized = selectedSubjects.filter(Boolean).map(String);

    // Ensure every day includes every subject the user typed.
    const allDaysHaveAllSubjects = parsed.weeklySchedule.every((d) => {
      const daySubjects = Array.isArray(d?.subjects) ? d.subjects.map(String) : [];
      return normalized.every((s) => daySubjects.includes(s));
    });

    if (allDaysHaveAllSubjects) return parsed;
  }
  return buildFallbackStudyPlan({ subjects, difficulty, goals });
}

async function generateCareerGuidance({ userId, careerObjective, background }) {
  const systemPrompt =
    "You are FocusPath AI, a career guidance assistant. Suggest career paths and next steps with concrete skills and certifications. Return ONLY valid JSON.";

  const userPrompt = `Career objective:
${JSON.stringify(careerObjective || {}, null, 2)}

Background:
${JSON.stringify(background || {}, null, 2)}

Return ONLY valid JSON with this shape:
{
  "paths": [
    { "name": string, "whyItFits": string, "targetRoleExamples": [string] }
  ],
  "requiredSkills": [string],
  "certifications": [
    { "name": string, "recommendedTimelineHint": string }
  ],
  "learningRoadmap": [
    { "phase": string, "focusAreas": [string], "practiceIdeas": [string] }
  ]
}`;

  const raw = await chat({ systemPrompt, userPrompt, temperature: 0.7 });
  const parsed = tryParseJson(raw);
  const responseForLog = parsed ? JSON.stringify(parsed) : raw;

  await logAi({
    userId,
    type: "career_guidance",
    prompt: userPrompt,
    response: responseForLog,
  });

  return parsed || { paths: [], requiredSkills: [], certifications: [], learningRoadmap: [], raw };
}

async function generateResumeOptimization({ userId, resumeText, targetRole, extraNotes }) {
  const systemPrompt =
    "You are FocusPath AI, an expert resume and ATS optimization assistant. Provide specific bullet edits, keywords, and LinkedIn suggestions. Return ONLY valid JSON.";

  const userPrompt = `Target role:
${JSON.stringify(targetRole || {}, null, 2)}

Extra notes:
${JSON.stringify(extraNotes || {}, null, 2)}

Resume:
${resumeText}

Return ONLY valid JSON with this shape:
{
  "summary": string,
  "atsKeywords": [string],
  "bulletEdits": [
    { "originalHint": string, "improvedBullet": string }
  ],
  "linkedinTips": [string],
  "nextSteps": [string]
}`;

  const raw = await chat({ systemPrompt, userPrompt, temperature: 0.6 });
  const parsed = tryParseJson(raw);
  const responseForLog = parsed ? JSON.stringify(parsed) : raw;

  await logAi({
    userId,
    type: "resume_optimization",
    prompt: userPrompt,
    response: responseForLog,
  });

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed;
  }
  return buildFallbackResumeOptimization({ resumeText, targetRole, extraNotes, raw });
}

async function generateMotivation({ userId, context }) {
  const systemPrompt =
    "You are FocusPath AI, a motivational study coach. Write a short message that is encouraging, specific, and tells the user exactly what to do next. Return a plain text response (no JSON).";

  const userPrompt = `Context:
${JSON.stringify(context || {}, null, 2)}

Write a motivational message that includes:
- 1 quick win the user can do in under 5 minutes
- 1 next action for their next study block
- 1 supportive line`;

  const raw = await chat({ systemPrompt, userPrompt, temperature: 0.8 });
  if (!raw) {
    const points = context?.points;
    const weakSubject = context?.weakSubject;
    const quickWin = weakSubject
      ? `Quick win: do a 5-minute Python-style warmup of “${weakSubject}” basics, then write 3 bullet notes.`
      : "Quick win: open your notes and do a 5-minute review + 3 bullet summary.";
    return `${quickWin}\n\nNext action: start one focused study block on your weakest topic.\n\nYou’ve got this. Keep it small and consistent.`;
  }
  await logAi({ userId, type: "motivation", prompt: userPrompt, response: raw });
  return raw;
}

async function chatAssistant({ userId, message, userContext, history = [] }) {
  const userName = userContext?.displayName || "there";
  const careerGoal = userContext?.careerObjectives?.objectiveText || "";
  const goals = userContext?.goals || {};

  const systemPrompt = `You are FocusPath AI — a smart, encouraging study and career assistant. Your job is to give real, specific, actionable help based on exactly what the user asks.

Rules:
- ALWAYS respond directly to the user's exact question or topic.
- If they ask about a specific topic (Python, React, SQL, Docker, DSA, etc.), give a real, detailed answer about THAT topic only.
- If they ask how to learn something, give a concrete learning roadmap with real topic names.
- If they ask what something is, explain it clearly with examples.
- If they ask for a study plan, generate a specific week-by-week plan with real topic names.
- If they ask career questions, give concrete role names, skills, and action steps.
- If they need motivation, be genuine and specific to their situation.
- Never give vague or generic answers. Always include specifics.
- Keep responses well-structured: use bullet points, numbered lists, and clear sections.
- Do NOT wrap responses in JSON. Respond in plain text with markdown formatting.

User profile:
- Name: ${userName}
- Career goal: ${careerGoal || "not specified"}
- Study focus: ${Array.isArray(goals.focusSubjects) ? goals.focusSubjects.join(", ") : "not specified"}
- Level: ${goals.difficulty || "intermediate"}`;

  const conversationMessages = [
    ...history.slice(-10).map((m) => ({
      role: m.from === "user" ? "user" : "assistant",
      content: m.text || m.content || "",
    })),
    { role: "user", content: message },
  ];

  const raw = await chatWithHistory({
    systemPrompt,
    messages: conversationMessages,
    temperature: 0.7,
  });

  const response = raw || buildFallbackTopicChat({ message, userContext });
  await logAi({ userId, type: "chat", prompt: message, response });
  return response;
}

module.exports = {
  generateStudyPlan,
  generateCareerGuidance,
  generateResumeOptimization,
  generateMotivation,
  chatAssistant,
  generateFlashcards,
  isLLMAvailable,
};

