vim.cmd("highlight RenderMarkdownCode guibg=#16181d")
vim.cmd("highlight @markup guifg=#f6f8ff")
vim.cmd("highlight @markup.heading guifg=#eaa668 guibg=#16181d")

vim.api.nvim_create_autocmd("BufReadPost", {
	callback = function()
		local max_lines = 5000 -- Replace with your preferred limit
		local line_count = vim.api.nvim_buf_line_count(0)
		if line_count > max_lines then
			vim.cmd("syntax off")
			vim.opt_local.syntax = "OFF"
			vim.opt_local.foldmethod = "manual" -- optional: avoid slow folds
		end
	end,
})

local file_is_in_root = function(name)
	local root_dir = vim.fs.root(0, name)
	-- vim.notify("root dir for " .. name .. " " .. vim.inspect(root_dir) .. " " .. vim.fn.getcwd())
	local is_in_root = root_dir ~= nil and root_dir == "."
	-- vim.notify(name .. " is in root " .. (is_in_root and "true" or "false"))
	-- local is_in_root = root_dir and root_dir == vim.fn.getcwd()
	if is_in_root then
		return true
	end
	return false
end

-- Function to check for the presence of a substring in a JSON file in the CWD
local function check_for_substring_in_json(filename, substring)
	-- Get the current working directory
	local cwd = vim.fn.getcwd()

	-- Construct the full file path
	local file_path = cwd .. "/" .. filename

	-- Read the file content using vim's API
	local file_content = vim.fn.readfile(file_path)

	-- Join the file content into a single string (readfile returns a table of lines)
	local json_str = table.concat(file_content, "")
	-- Check if the substring is present in the JSON string
	if string.find(json_str, substring, 1, true) ~= nil then
		return true
	else
		return false
	end
end

local use_eslint_prettier = false

if file_is_in_root("package.json") then
	-- if this is true, we'll use prettier via eslint via eslint-lsp, otherwise we'll try to fallback to prettierd and prettier
	use_eslint_prettier = check_for_substring_in_json("package.json", "eslint-plugin-prettier")
end

vim.cmd("syntax off")

vim.opt.autoread = true
vim.opt.background = "dark"
vim.o.termguicolors = true
vim.opt.fillchars = { eob = " " }

vim.o.scrollback = 100000

vim.g.mapleader = " "
vim.g.maplocalleader = " "

vim.opt.number = true
vim.opt.relativenumber = true

vim.diagnostic.config({
	signs = {
		text = {
			[vim.diagnostic.severity.ERROR] = "", -- DiagnosticSignError symbol
			[vim.diagnostic.severity.HINT] = "󰘥", -- DiagnosticSignHint symbol
		},
		-- Optionally you can also set numhl or linehl here if you use them
		-- numhl = {
		--   [vim.diagnostic.severity.ERROR] = "DiagnosticSignError",
		--   [vim.diagnostic.severity.HINT]  = "DiagnosticSignHint",
		-- },
	},
})

vim.opt.mouse = "a"

vim.opt.showmode = false

vim.opt.clipboard = "unnamedplus"

vim.opt.breakindent = true

vim.opt.undofile = true

-- Case-insensitive searching UNLESS \C or capital in search
vim.opt.ignorecase = true
vim.opt.smartcase = true

vim.opt.signcolumn = "yes"

-- Decrease update time
vim.opt.updatetime = 250
vim.o.timeout = true
vim.opt.timeoutlen = 300

-- Configure how new splits should be opened
vim.opt.splitright = false
vim.opt.splitbelow = true

-- Sets how neovim will display certain whitespace in the editor.
--  See `:help 'list'`
--  and `:help 'listchars'`

-- Preview substitutions live, as you type!
vim.opt.inccommand = "split"

-- Show which line your cursor is on
vim.opt.cursorline = true

-- Minimal number of screen lines to keep above and below the cursor.
vim.opt.scrolloff = 4
vim.opt.splitkeep = "screen"
vim.opt.timeoutlen = 500
vim.opt.ttimeoutlen = 5

vim.cmd("set ww+=<,>,[,],h,l")
vim.cmd("set keymodel=startsel,stopsel")

vim.opt.numberwidth = 1
vim.opt.mousescroll = "hor:1,ver:1"
vim.opt.linebreak = true
vim.opt.showbreak = "wrap›››     "
vim.opt.wrap = true
vim.opt.textwidth = 0
vim.opt.wrapmargin = 0
vim.o.completeopt = "menuone,noselect"

-- [[ Basic Keymaps ]]
--  See `:help vim.keymap.set()`

-- remap ; to leader>: in normal mode so that I don't have to press shift
vim.api.nvim_set_keymap("n", "<leader>;", ":", { noremap = true })

vim.api.nvim_set_keymap("n", "<leader>E", ":e!<CR>", { noremap = true, desc = "Reload current buffer" })

-- remap ctrl+j/k to move up/down in command mode
vim.cmd("cnoremap <C-k> <Up>")
vim.cmd("cnoremap <C-j> <Down>")

-- stay in visual mode after indenting
vim.api.nvim_set_keymap("v", "<", "<gv", { noremap = true })
vim.api.nvim_set_keymap("v", ">", ">gv", { noremap = true })

---ask for a filename and create file
vim.keymap.set("n", "<leader>n", function()
	local name = vim.fn.input("Filename: > ")

	if name == "" then
		return
	end
	vim.cmd("e " .. name)
end, { desc = "New file" })

-- Set highlight on search, but clear on pressing <Esc> in normal mode
vim.opt.hlsearch = true
vim.keymap.set("n", "<Esc>", "<cmd>nohlsearch<CR>")

vim.diagnostic.config({
	virtual_text = {
		severity = { min = vim.diagnostic.severity.ERROR, max = vim.diagnostic.severity.ERROR },
		format = function(diagnostic)
			return string.format("L%d: %s", diagnostic.lnum + 1, diagnostic.message)
		end,
	},
})
-- Diagnostic keymaps
vim.keymap.set("n", "<leader>do", function()
	vim.diagnostic.open_float({
		focusable = true,
		scope = "buffer",
		severity = { min = vim.diagnostic.severity.ERROR, max = vim.diagnostic.severity.ERROR },
		format = function(diagnostic)
			return string.format("L%d: %s", diagnostic.lnum + 1, diagnostic.message)
		end,
	})
	vim.diagnostic.open_float({
		focusable = true,
		scope = "buffer",
		severity = { min = vim.diagnostic.severity.ERROR, max = vim.diagnostic.severity.ERROR },
		format = function(diagnostic)
			return string.format("L%d: %s", diagnostic.lnum + 1, diagnostic.message)
		end,
	})
end, { desc = "Expand an Error into a float" })
vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, { desc = "Go to previous [D]iagnostic message" })
vim.keymap.set("n", "]d", vim.diagnostic.goto_next, { desc = "Go to next [D]iagnostic message" })
vim.keymap.set("n", "<leader>ck", function()
	vim.diagnostic.goto_prev({ severity = vim.diagnostic.severity.ERROR })
	vim.cmd(":normal! zz<CR>")
end, { desc = "Go to previous [c]ode diagnostic message" })
vim.keymap.set("n", "<leader>cj", function()
	vim.diagnostic.goto_next({ severity = vim.diagnostic.severity.ERROR })
	vim.cmd(":normal! zz<CR>")
end, { desc = "Go to next [c]ode diagnostic message" })

-- save buffer
vim.keymap.set("n", "<leader>s", function()
	vim.cmd(":w")
end, {
	desc = "Save buffer",
})

vim.keymap.set("n", "<leader>W", function()
	vim.cmd("bufdo bwipeout")
end, { desc = "Close all buffers" })
vim.keymap.set("n", "<leader>w", function()
	-- using bufdelete cause it asks to save
	require("bufdelete").bufdelete(0)
end, { desc = "Close active buffer" })

-- quit all
vim.keymap.set("n", "<leader>x", function()
	vim.cmd("quitall")
end, { desc = "Quit neovim" })

-- quit current window
vim.keymap.set("n", "<leader>q", function()
	vim.cmd("q")
end, { desc = "Quit window (or neovim if last window)" })

-- Remap for dealing with word wrap when moving up and down
vim.keymap.set("n", "k", "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
vim.keymap.set("n", "j", "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })

vim.keymap.set("t", "<C-d>", "<C-\\><C-n>", {
	desc = "Exit terminal mode",
})
vim.keymap.set("t", "<C-u>", "<C-\\><C-n>", {
	desc = "Exit terminal mode",
})

vim.api.nvim_set_keymap("n", "<C-u>", "Hzz", {
	desc = "Center cursor after moving half page",
})
vim.api.nvim_set_keymap("n", "<C-d>", "Lzz", {
	desc = "Center cursor after moving half page",
})

vim.keymap.set("n", "i", function()
	if #vim.fn.getline(".") == 0 then
		return [["_cc]]
	else
		return "i"
	end
end, { expr = true, desc = "properly indent on empty line when insert" })

vim.keymap.set("n", "<leader>cp", function()
	vim.fn.setreg("+", vim.fn.expand("%:."))
end, { desc = "Copy current relative file path" })

vim.keymap.set("n", "<leader>-", function()
	vim.cmd("split")
end, { desc = "horizontal split" })
vim.keymap.set("n", "<leader>\\", function()
	vim.cmd("vsplit")
end, { desc = "vertical split" })

vim.keymap.set("n", "<leader>cc", "<cmd>Calendar<CR>", { desc = "Open Calendar" })

-- [[ Basic Autocommands ]]
--  See `:help lua-guide-autocommands`

-- Highlight when yanking (copying) text
--  Try it with `yap` in normal mode
--  See `:help vim.highlight.on_yank()`
vim.api.nvim_create_autocmd("TextYankPost", {
	desc = "Highlight when yanking (copying) text",
	group = vim.api.nvim_create_augroup("kickstart-highlight-yank", { clear = true }),
	callback = function()
		vim.highlight.on_yank()
	end,
})

-- [[ Install `lazy.nvim` plugin manager ]]
--    See `:help lazy.nvim.txt` or https://github.com/folke/lazy.nvim for more info
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
	local lazyrepo = "https://github.com/folke/lazy.nvim.git"
	vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
end ---@diagnostic disable-next-line: undefined-field
vim.opt.rtp:prepend(lazypath)

-- [[ Configure and install plugins ]]
--
--  To check the current status of your plugins, run
--    :Lazy
--
--  You can press `?` in this menu for help. Use `:q` to close the window
--
--  To update plugins, you can run
--    :Lazy update
--
-- NOTE: Here is where you install your plugins.
require("lazy").setup({
	-- NOTE: Plugins can be added with a link (or for a github repo: 'owner/repo' link).
	"tpope/vim-sleuth", -- Detect tabstop and shiftwidth automatically

	-- NOTE: Plugins can also be added by using a table,
	-- with the first argument being the link and the following
	-- keys can be used to configure plugin behavior/loading/etc.
	--
	-- Use `opts = {}` to force a plugin to be loaded.
	--
	--  This is equivalent to:
	--    require('Comment').setup({})

	-- "gc" to comment visual regions/lines
	{
		"numToStr/Comment.nvim",
		opts = {
			toggler = {
				line = "<leader>/",
			},
			opleader = {
				line = "<leader>/",
			},
		},
	},

	-- NOTE: Plugins can also be configured to run lua code when they are loaded.
	--
	-- This is often very useful to both group configuration, as well as handle
	-- lazy loading plugins that don't need to be loaded immediately at startup.
	--
	-- For example, in the following configuration, we use:
	--  event = 'VimEnter'
	--
	-- which loads which-key before all the UI elements are loaded. Events can be
	-- normal autocommands events (`:help autocmd-events`).
	--
	-- Then, because we use the `config` key, the configuration only runs
	-- after the plugin has been loaded:
	--  config = function() ... end

	{ -- Useful plugin to show you pending keybinds.
		"folke/which-key.nvim",
		event = "VimEnter", -- Sets the loading event to 'VimEnter'
		config = function() -- This is the function that runs, AFTER loading
			require("which-key").setup()
		end,
	},

	-- NOTE: Plugins can specify dependencies.
	--
	-- The dependencies are proper plugin specifications as well - anything
	-- you do for a plugin at the top level, you can do for a dependency.
	--
	-- Use the `dependencies` key to specify the dependencies of a particular plugin

	{ -- Fuzzy Finder (files, lsp, etc)
		"nvim-telescope/telescope.nvim",
		event = "VimEnter",
		-- branch = "0.1.x",
		dependencies = {
			"nvim-telescope/telescope-live-grep-args.nvim",
			"nvim-lua/plenary.nvim",
			{ -- If encountering errors, see telescope-fzf-native README for install instructions
				"nvim-telescope/telescope-fzf-native.nvim",

				-- `build` is used to run some command when the plugin is installed/updated.
				-- This is only run then, not every time Neovim starts up.
				build = "make",

				-- `cond` is a condition used to determine whether this plugin should be
				-- installed and loaded.
				cond = function()
					return vim.fn.executable("make") == 1
				end,
			},
			{ "nvim-telescope/telescope-ui-select.nvim" },

			-- Useful for getting pretty icons, but requires special font.
			--  If you already have a Nerd Font, or terminal set up with fallback fonts
			--  you can enable this
			-- { 'nvim-tree/nvim-web-devicons' }
		},
		config = function()
			-- Telescope is a fuzzy finder that comes with a lot of different things that
			-- it can fuzzy find! It's more than just a "file finder", it can search
			-- many different aspects of Neovim, your workspace, LSP, and more!
			--
			-- The easiest way to use telescope, is to start by doing something like:
			--  :Telescope help_tags
			--
			-- After running this command, a window will open up and you're able to
			-- type in the prompt window. You'll see a list of help_tags options and
			-- a corresponding preview of the help.
			--
			-- Two important keymaps to use while in telescope are:
			--  - Insert mode: <c-/>
			--  - Normal mode: ?
			--
			-- This opens a window that shows you all of the keymaps for the current
			-- telescope picker. This is really useful to discover what Telescope can
			-- do as well as how to actually do it!

			-- [[ Configure Telescope ]]
			-- See `:help telescope` and `:help telescope.setup()`
			require("telescope").setup({
				-- You can put your default mappings / updates / etc. in here
				--  All the info you're looking for is in `:help telescope.setup()`
				--
				defaults = {
					sorting_strategy = "ascending",
					layout_strategy = "flex",
					layout_config = {
						flex = {
							flip_columns = 200,
						},

						prompt_position = "top",
						mirror = false,
						preview_cutoff = 1, -- Preview should always show (unless previewer = false)

						width = function(_, max_columns, _)
							return math.min(max_columns, 180)
						end,

						height = 2000,
					},

					border = true,
					borderchars = {
						prompt = { "─", "│", " ", "│", "╭", "╮", "│", "│" },
						results = { " ", "│", "─", "│", "│", "│", "╯", "╰" },
						preview = { "─", "│", "─", "│", "╭", "╮", "╯", "╰" },
					},

					path_display = {
						truncate = true,
					},
					results_title = false,
					file_ignore_patterns = { "^.git/" },
					initial_mode = "normal",
					mappings = {
						i = {
							["<C-u>"] = false,
							["<C-d>"] = false,
						},
						n = {
							["l"] = require("telescope.actions").select_default,
							[";"] = require("telescope.actions").select_default,
							["q"] = require("telescope.actions").close,
						},
					},
				},
			})

			-- Enable telescope extensions, if they are installed
			pcall(require("telescope").load_extension, "fzf")
			pcall(require("telescope").load_extension, "ui-select")

			-- See `:help telescope.builtin`
			local builtin = require("telescope.builtin")
			vim.keymap.set("n", "<leader>h", function()
				require("telescope.builtin").help_tags()
			end, {
				desc = "Telescope help tags",
			})
			vim.keymap.set("n", "<leader>ff", function()
				require("telescope.builtin").find_files({
					hidden = true,
				})
			end, { desc = "[F]ind [F]iles" })
			vim.keymap.set("n", "<leader>fd", function()
				require("utils").make_directory_picker("Choose directory to grep in", function(cwd, file_path)
					local search_dir = cwd .. file_path
					require("telescope").extensions.live_grep_args.live_grep_args({
						prompt_title = "Live grep args in " .. file_path,
						hidden = true,
						search_dirs = { search_dir },
					})
				end)
			end, { noremap = true, desc = "[F]ind string in directory" })
			vim.keymap.set("n", "<leader>fh", require("telescope.builtin").help_tags, { desc = "[F]ind [H]elp" })
			vim.keymap.set("n", "<leader>fr", function()
				require("telescope.builtin").oldfiles({
					previewer = false,
					initial_mode = "normal",
					only_cwd = true,
					hidden = true,
				})
			end, { desc = "[r] Find recently opened files" })

			vim.keymap.set("n", "<leader>F", function()
				require("telescope").extensions.live_grep_args.live_grep_args({ hidden = true })
			end, { noremap = true, desc = "[F]ind string in directory" })
			vim.keymap.set(
				"n",
				"<leader>r",
				require("telescope.builtin").resume,
				{ desc = "Resume last telescope picker" }
			)

			vim.keymap.set("n", "<leader>cd", function()
				require("telescope.builtin").diagnostics({ bufnr = 0, line_width = 800 })
			end, { desc = "[C]ode [D]iagnostics current buffer" })
			vim.keymap.set("n", "<leader>cdf", vim.diagnostic.open_float, { desc = "[C]ode [D]iagnostics [F]loat" })

			vim.keymap.set("n", "<leader>vn", function()
				require("telescope").extensions.notify.notify()
			end, {
				desc = "View notification history",
			})

			-- vim.keymap.set("n", "<leader>sh", builtin.help_tags, { desc = "[S]earch [H]elp" })
			-- vim.keymap.set("n", "<leader>sk", builtin.keymaps, { desc = "[S]earch [K]eymaps" })
			-- vim.keymap.set("n", "<leader>sf", builtin.find_files, { desc = "[S]earch [F]iles" })
			-- vim.keymap.set("n", "<leader>ss", builtin.builtin, { desc = "[S]earch [S]elect Telescope" })
			-- vim.keymap.set("n", "<leader>sw", builtin.grep_string, { desc = "[S]earch current [W]ord" })
			-- vim.keymap.set("n", "<leader>sg", builtin.live_grep, { desc = "[S]earch by [G]rep" })
			-- vim.keymap.set("n", "<leader>sd", builtin.diagnostics, { desc = "[S]earch [D]iagnostics" })
			-- vim.keymap.set("n", "<leader>sr", builtin.resume, { desc = "[S]earch [R]esume" })
			-- vim.keymap.set("n", "<leader>s.", builtin.oldfiles, { desc = '[S]earch Recent Files ("." for repeat)' })
			vim.keymap.set("n", "<leader><leader>", builtin.buffers, { desc = "[ ] Find existing buffers" })

			-- Slightly advanced example of overriding default behavior and theme
			vim.keymap.set("n", "<leader>fz", function()
				-- You can pass additional configuration to telescope to change theme, layout, etc.
				builtin.current_buffer_fuzzy_find(require("telescope.themes").get_dropdown({
					winblend = 10,
					previewer = false,
				}))
			end, { desc = "[/] Fuzzily search in current buffer" })

			-- Also possible to pass additional configuration options.
			--  See `:help telescope.builtin.live_grep()` for information about particular keys
			-- vim.keymap.set("n", "<leader>s/", function()
			-- 	builtin.live_grep({
			-- 		grep_open_files = true,
			-- 		prompt_title = "Live Grep in Open Files",
			-- 	})
			-- end, { desc = "[S]earch [/] in Open Files" })
			--
			-- Shortcut for searching your neovim configuration files
			-- vim.keymap.set("n", "<leader>sn", function()
			-- 	builtin.find_files({ cwd = vim.fn.stdpath("config") })
			-- end, { desc = "[S]earch [N]eovim files" })
		end,
	},

	{
		"neovim/nvim-lspconfig",
		dependencies = {
			"williamboman/mason.nvim",
			"williamboman/mason-lspconfig.nvim",
			"WhoIsSethDaniel/mason-tool-installer.nvim",
		},
		config = function()
			-- Helper to create normal-mode mappings
			local nmap = function(keys, func, desc)
				if desc then
					desc = "LSP: " .. desc
				end
				vim.keymap.set("n", keys, func, { desc = desc })
			end
			nmap("<leader>lr", "<cmd>LspRestart<CR>", "Restart LSP")

			-- Zsh files as bash
			vim.api.nvim_create_augroup("zshAsBash", {})
			vim.api.nvim_create_autocmd("BufWinEnter", {
				group = "zshAsBash",
				pattern = { "*.sh", "*.zsh", ".zshrc" },
				command = "silent! set filetype=sh",
			})

			-- On LspAttach, set buffer-local mappings
			vim.api.nvim_create_autocmd("LspAttach", {
				group = vim.api.nvim_create_augroup("kickstart-lsp-attach", { clear = true }),
				callback = function(event)
					local map = function(keys, func, desc)
						vim.keymap.set("n", keys, func, { buffer = event.buf, desc = "LSP: " .. desc })
					end
					map("gd", require("telescope.builtin").lsp_definitions, "[G]oto [D]efinition")
					map("gI", require("telescope.builtin").lsp_implementations, "[G]oto [I]mplementation")
					map("<leader>D", require("telescope.builtin").lsp_type_definitions, "Type [D]efinition")
					map("<leader>ds", require("telescope.builtin").lsp_document_symbols, "[D]ocument [S]ymbols")
					map(
						"<leader>ws",
						require("telescope.builtin").lsp_dynamic_workspace_symbols,
						"[W]orkspace [S]ymbols"
					)
					map("<leader>rn", vim.lsp.buf.rename, "[R]e[n]ame")
					map("<leader>ca", vim.lsp.buf.code_action, "[C]ode [A]ction")
					map("K", vim.lsp.buf.hover, "Hover Documentation")
					map("gD", vim.lsp.buf.declaration, "[G]oto [D]eclaration")
				end,
			})

			-- Capabilities for nvim-cmp
			local capabilities = vim.lsp.protocol.make_client_capabilities()
			capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

			-- Your full server settings from your config
			local servers = {
				jsonls = {},
				gopls = {},
				vuels = {},
				jsonls = {
					filetypes = { "json", "jsonc" },
					settings = {
						json = {
							schemas = {
								{ fileMatch = { "package.json" }, url = "https://json.schemastore.org/package.json" },
								{
									fileMatch = { "tsconfig*.json" },
									url = "https://json.schemastore.org/tsconfig.json",
								},
								{
									fileMatch = { ".prettierrc", ".prettierrc.json", "prettier.config.json" },
									url = "https://json.schemastore.org/prettierrc.json",
								},
								{
									fileMatch = { ".eslintrc", ".eslintrc.json" },
									url = "https://json.schemastore.org/eslintrc.json",
								},
								{
									fileMatch = { ".babelrc", ".babelrc.json", "babel.config.json" },
									url = "https://json.schemastore.org/babelrc.json",
								},
								{ fileMatch = { "lerna.json" }, url = "https://json.schemastore.org/lerna.json" },
								{
									fileMatch = { "now.json", "vercel.json" },
									url = "https://json.schemastore.org/now.json",
								},
								{
									fileMatch = { ".stylelintrc", ".stylelintrc.json", "stylelint.config.json" },
									url = "http://json.schemastore.org/stylelintrc.json",
								},
							},
						},
					},
				},
				denols = {
					root_dir = function(fname)
						return require("lspconfig").util.root_pattern("deps.ts")(fname)
							or require("lspconfig").util.root_pattern("mod.ts")(fname)
					end,
				},
				dockerls = {},
				cssls = {},
				vimls = {},
				pyright = {},
				yamlls = {
					settings = {
						yaml = {
							schemas = {
								["http://json.schemastore.org/gitlab-ci.json"] = { ".gitlab-ci.yml" },
								["https://json.schemastore.org/bamboo-spec.json"] = { "bamboo-specs/*.{yml,yaml}" },
								["https://raw.githubusercontent.com/compose-spec/compose-spec/master/schema/compose-spec.json"] = {
									"docker-compose*.{yml,yaml}",
								},
								["http://json.schemastore.org/github-workflow.json"] = ".github/workflows/*.{yml,yaml}",
								["http://json.schemastore.org/github-action.json"] = ".github/action.{yml,yaml}",
								["http://json.schemastore.org/prettierrc.json"] = ".prettierrc.{yml,yaml}",
								["http://json.schemastore.org/stylelintrc.json"] = ".stylelintrc.{yml,yaml}",
								["http://json.schemastore.org/circleciconfig"] = ".circleci/**/*.{yml,yaml}",
							},
						},
					},
				},
				vtsls = {
					settings = {
						refactor_auto_rename = true,
						typescript = { format = { enable = false }, tsserver = { maxTsServerMemory = 13312 } },
						experimental = {
							watchOptions = {
								excludeFiles = {
									"**/eslint.config.js",
									"**/node_modules/**",
									"**/.mastra/**",
								},
							},
						},
					},
				},
				prettierd = {},
				eslint = {
					-- If you use a dynamic flag like use_eslint_prettier, set it above in your config
					capabilities = {
						textDocument = {
							formatting = {
								dynamicRegistration = true, -- or use your use_eslint_prettier variable
							},
							rangeFormatting = {
								dynamicRegistration = true,
							},
						},
					},
				},
				bashls = {
					filetypes = { "sh", "zsh", "bash", ".zshrc", ".conf" },
				},
				lua_ls = {
					settings = {
						Lua = {
							runtime = { version = "LuaJIT" },
							workspace = {
								checkThirdParty = false,
								library = {
									"${3rd}/luv/library",
									unpack(vim.api.nvim_get_runtime_file("", true)),
								},
							},
							completion = { callSnippet = "Replace" },
						},
					},
				},
			}

			-- .conf and .overlay filetypes
			vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
				pattern = "*.conf",
				callback = function()
					vim.bo.filetype = "bash"
				end,
			})
			vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
				pattern = "*.overlay",
				callback = function()
					vim.bo.filetype = "c"
				end,
			})

			require("mason").setup()

			-- Split LSP servers and tools
			local lsp_servers = {}
			local tools = { "stylua" }
			for k, _ in pairs(servers) do
				-- These are *LSP servers*, skip tools like prettierd
				if not vim.tbl_contains({ "prettierd", "eslint_d", "stylua" }, k) then
					table.insert(lsp_servers, k)
				else
					table.insert(tools, k)
				end
			end

			require("mason-lspconfig").setup({
				ensure_installed = lsp_servers,
				automatic_enable = true,
			})

			-- Use the new Neovim 0.11+ LSP API to set up each server
			for name, config in pairs(servers) do
				if name ~= "prettierd" and name ~= "eslint_d" and name ~= "stylua" then
					config.capabilities = vim.tbl_deep_extend("force", {}, capabilities, config.capabilities or {})
					vim.lsp.config(name, config)
				end
			end
		end,
	},

	{ -- Autoformat
		"stevearc/conform.nvim",
		dependencies = { { "MunifTanjim/prettier.nvim", event = "VimEnter" } },
		config = function()
			local prettier_config = {
				condition = function()
					return use_eslint_prettier ~= true
						and require("prettier").config_exists({
							check_package_json = true,
						})
				end,
				cwd = require("conform.util").root_file({
					".prettierrc",
					".prettierrc.json",
					".git",
					"package.json",
				}),
				-- When cwd is not found, don't run the formatter (default false)
				require_cwd = true,
			}

			require("conform").setup({
				notify_on_error = false,
				format_on_save = {
					timeout_ms = 8000,
					lsp_fallback = true,
				},
				formatters_by_ft = {
					lua = { "stylua" },
					-- Conform can also run multiple formatters sequentially
					-- python = { "isort", "black" },
					--
					-- You can use a sub-list to tell conform to run *until* a formatter
					-- is found.
					json = { "prettierd", "prettier", stop_after_first = true },

					-- prefer because we're using eslint-lsp for formatting when an eslint.config.js is present
					javascript = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
					typescript = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
					javascriptreact = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
					typescriptreact = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
					markdown = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
					graphql = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
					mdx = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
					html = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
					css = { lsp_format = "prefer", "prettierd", "prettier", stop_after_first = true },
				},
				formatters = {

					prettier = prettier_config,
					prettierd = prettier_config,
				},
			})
		end,
	},

	{ -- Autocompletion
		"hrsh7th/nvim-cmp",
		event = "InsertEnter",
		dependencies = {
			-- Snippet Engine & its associated nvim-cmp source
			{
				"L3MON4D3/LuaSnip",
				build = (function()
					-- Build Step is needed for regex support in snippets
					-- This step is not supported in many windows environments
					-- Remove the below condition to re-enable on windows
					if vim.fn.has("win32") == 1 or vim.fn.executable("make") == 0 then
						return
					end
					return "make install_jsregexp"
				end)(),
			},
			"saadparwaiz1/cmp_luasnip",

			-- Adds other completion capabilities.
			--  nvim-cmp does not ship with all sources by default. They are split
			--  into multiple repos for maintenance purposes.
			"hrsh7th/cmp-nvim-lsp",
			"hrsh7th/cmp-path",
			"hrsh7th/cmp-buffer",
			"hrsh7th/cmp-nvim-lsp-signature-help",
			"hrsh7th/cmp-emoji",
			"David-Kunz/cmp-npm",
			"ray-x/cmp-treesitter",
			"SergioRibera/cmp-dotenv",

			-- If you want to add a bunch of pre-configured snippets,
			--    you can use this plugin to help you. It even has snippets
			--    for various frameworks/libraries/etc. but you will have to
			--    set up the ones that are useful for you.
			"rafamadriz/friendly-snippets",
		},
		config = function()
			local lspkind_comparator = function(conf)
				local lsp_types = require("cmp.types").lsp
				return function(entry1, entry2)
					if entry1.source.name ~= "nvim_lsp" then
						if entry2.source.name == "nvim_lsp" then
							return false
						else
							return nil
						end
					end
					local kind1 = lsp_types.CompletionItemKind[entry1:get_kind()]
					local kind2 = lsp_types.CompletionItemKind[entry2:get_kind()]

					local priority1 = conf.kind_priority[kind1] or 0
					local priority2 = conf.kind_priority[kind2] or 0
					if priority1 == priority2 then
						return nil
					end
					return priority2 < priority1
				end
			end

			local label_comparator = function(entry1, entry2)
				return entry1.completion_item.label < entry2.completion_item.label
			end

			-- See `:help cmp`
			local cmp = require("cmp")
			local luasnip = require("luasnip")
			luasnip.config.setup({})

			local function border(hl_name)
				return {
					{ "╭", hl_name },
					{ "─", hl_name },
					{ "╮", hl_name },
					{ "│", hl_name },
					{ "╯", hl_name },
					{ "─", hl_name },
					{ "╰", hl_name },
					{ "│", hl_name },
				}
			end
			require("cmp-npm").setup({})
			require("luasnip.loaders.from_vscode").lazy_load()
			local cmp_autopairs = require("nvim-autopairs.completion.cmp")
			cmp.event:on("confirm_done", cmp_autopairs.on_confirm_done())
			---@diagnostic disable-next-line: redundant-parameter
			cmp.setup({
				snippet = {
					expand = function(args)
						luasnip.lsp_expand(args.body)
					end,
				},
				completion = { completeopt = "menu,menuone,noinsert" },

				window = {
					documentation = {
						border = border("CmpDocBorder"),
						winhighlight = "Normal:CmpDoc",
					},
					completion = {
						side_padding = 1,
						border = border("CmpPmenu"),
						winhighlight = "Normal:CmpPmenu,CursorLine:CmpSel,Search:PmenuSel",
					},
				},
				preselect = cmp.PreselectMode.None,

				-- For an understanding of why these mappings were
				-- chosen, you will need to read `:help ins-completion`
				--
				-- No, but seriously. Please read `:help ins-completion`, it is really good!
				mapping = cmp.mapping.preset.insert({
					-- Select the [n]ext item
					-- ["<C-j>"] = cmp.mapping(function()
					--     if cmp.visible() then
					--         cmp.select_next_item()
					--
					--     --   luasnip.expand_or_jump()
					--     else
					--         cmp.complete()
					--     end
					-- end, { "i", "s" }),
					["<C-j>"] = cmp.mapping.select_next_item(),
					-- Select the [p]revious item
					["<C-k>"] = cmp.mapping.select_prev_item(),

					-- Accept ([y]es) the completion.
					--  This will auto-import if your LSP supports it.
					--  This will expand snippets if the LSP sent a snippet.
					["<C-y>"] = cmp.mapping.confirm({ select = false }),
					["<C-c>"] = cmp.mapping.close(),
					["<CR>"] = cmp.mapping(function(fallback)
						if cmp.visible() then
							-- if luasnip.expandable() then
							--     luasnip.expand()
							-- else
							cmp.confirm({
								select = false,
							})
							-- end
						else
							fallback()
						end
					end),
					["<Tab>"] = cmp.mapping(function(fallback)
						-- if cmp.visible() then
						-- 	cmp.select_next_item()
						if luasnip.locally_jumpable(1) then
							luasnip.jump(1)
						else
							fallback()
						end
					end, { "i", "s" }),

					["<S-Tab>"] = cmp.mapping(function(fallback)
						-- if cmp.visible() then
						-- 	cmp.select_prev_item()
						if luasnip.locally_jumpable(-1) then
							luasnip.jump(-1)
						else
							fallback()
						end
					end, { "i", "s" }),

					-- Manually trigger a completion from nvim-cmp.
					--  Generally you don't need this, because nvim-cmp will display
					--  completions whenever it has completion options available.

					-- Think of <c-l> as moving to the right of your snippet expansion.
					--  So if you have a snippet that's like:
					--  function $name($args)
					--    $body
					--  end
					--
					-- <c-l> will move you to the right of each of the expansion locations.
					-- <c-h> is similar, except moving you backwards.
					["<C-l>"] = cmp.mapping(function()
						if luasnip.expand_or_locally_jumpable() then
							luasnip.expand_or_jump()
						end
					end, { "i", "s" }),
				}),
				sorting = {
					comparators = {
						cmp.config.compare.offset,
						cmp.config.compare.exact,
						cmp.config.compare.score,
						cmp.config.compare.recently_used,
						cmp.config.compare.locality,
						lspkind_comparator({
							kind_priority = {
								Field = 11,
								Property = 11,
								Constant = 10,
								Enum = 10,
								EnumMember = 10,
								Event = 10,
								Function = 10,
								Method = 10,
								Operator = 10,
								Reference = 10,
								Struct = 10,
								Variable = 9,
								File = 8,
								Folder = 8,
								Class = 5,
								Color = 5,
								Module = 5,
								Keyword = 2,
								Constructor = 1,
								Interface = 1,
								Snippet = 0,
								Text = 1,
								TypeParameter = 1,
								Unit = 1,
								Value = 1,
							},
						}),
						label_comparator,

						cmp.config.compare.sort_text,
						cmp.config.compare.length,
						cmp.config.compare.order,
					},
				},
				sources = {
					-- { name = "treesitter" },
					{ name = "nvim_lsp" },
					{ name = "path" },
					{ name = "luasnip" },
					{
						name = "dotenv",
						option = {
							-- path = ".",
							-- load_shell = true,
							-- item_kind = cmp.lsp.CompletionItemKind.Variable,
							-- eval_on_confirm = false,
							-- show_documentation = true,
							show_content_on_docs = false,
							-- documentation_kind = "markdown",
							-- dotenv_environment = ".*",
							-- file_priority = function(a, b)
							-- 	-- Prioritizing local files
							-- 	return a:upper() < b:upper()
							-- end,
						},
					},
					{ name = "npm", keyword_length = 4 },
					{ name = "nvim_lsp_signature_help" },
					{ name = "emoji" },
				},
			})
		end,
	},

	{
		"TylerBarnes/oxocarbon.nvim",
		lazy = false,
		priority = 1000,
		config = function() end,
		-- dir = "~/fun/oxocarbon.nvim",
	},

	-- Highlight todo, notes, etc in comments
	{
		"folke/todo-comments.nvim",
		event = "VimEnter",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = { signs = false },
	},

	{ -- Collection of various small independent plugins/modules
		"echasnovski/mini.nvim",
		config = function()
			-- Better Around/Inside textobjects
			--
			-- Examples:
			--  - va)  - [V]isually select [A]round [)]paren
			--  - yinq - [Y]ank [I]nside [N]ext [']quote
			--  - ci'  - [C]hange [I]nside [']quote
			require("mini.ai").setup({ n_lines = 500 })

			-- Add/delete/replace surroundings (brackets, quotes, etc.)
			--
			-- - saiw) - [S]urround [A]dd [I]nner [W]ord [)]Paren
			-- - sd'   - [S]urround [D]elete [']quotes
			-- - sr)'  - [S]urround [R]eplace [)] [']
			require("mini.surround").setup({
				mappings = {
					add = "ma", -- Add surrounding in Normal and Visual modes
					delete = "md", -- Delete surrounding
					find = "mf", -- Find surrounding (to the right)
					find_left = "mF", -- Find surrounding (to the left)
					highlight = "mh", -- Highlight surrounding
					replace = "mr", -- Replace surrounding
					update_n_lines = "mn", -- Update `n_lines`

					suffix_last = "ml", -- Suffix to search with "prev" method
					suffix_next = "mn", -- Suffix to search with "next" method
				},
			})

			vim.opt.laststatus = 3

			-- ... and there is more!
			--  Check out: https://github.com/echasnovski/mini.nvim
		end,
	},

	{ -- Highlight, edit, and navigate code
		"nvim-treesitter/nvim-treesitter",
		build = ":TSUpdate",
		config = function()
			-- [[ Configure Treesitter ]] See `:help nvim-treesitter`

			---@diagnostic disable-next-line: missing-fields
			require("nvim-treesitter.configs").setup({
				ensure_installed = {
					"bash",
					"c",
					"html",
					"lua",
					"markdown",
					"markdown_inline",
					"yaml",
					"vim",
					"vimdoc",
					"javascript",
					"typescript",
					"go",
				},
				-- Autoinstall languages that are not installed
				auto_install = true,
				highlight = { enable = true },
				indent = { enable = true },
			})

			-- There are additional nvim-treesitter modules that you can use to interact
			-- with nvim-treesitter. You should go explore a few and see what interests you:
			--
			--    - Incremental selection: Included, see `:help nvim-treesitter-incremental-selection-mod`
			--    - Show your current context: https://github.com/nvim-treesitter/nvim-treesitter-context
			--    - Treesitter + textobjects: https://github.com/nvim-treesitter/nvim-treesitter-textobjects
		end,
	},

	{
		"nvim-treesitter/nvim-treesitter-context",
		lazy = false,
		-- event = "VeryLazy",
		config = function()
			vim.cmd("highlight TreesitterContextSeparator guifg=#222222")

			require("treesitter-context").setup({
				enable = true, -- Enable this plugin (Can be enabled/disabled later via commands)
				max_lines = 2, -- How many lines the window should span. Values <= 0 mean no limit.
				min_window_height = 10, -- Minimum editor window height to enable context. Values <= 0 mean no limit.
				line_numbers = false,
				multiline_threshold = 20, -- Maximum number of lines to show for a single context
				trim_scope = "inner", -- Which context lines to discard if `max_lines` is exceeded. Choices: 'inner', 'outer'
				mode = "cursor", -- Line used to calculate context. Choices: 'cursor', 'topline'
				-- Separator between context and content. Should be a single character string, like '-'.
				-- When separator is set, the context will only show up when there are at least 2 lines above cursorline.
				-- separator = nil,
				-- separator = "○",
				separator = "─",
				zindex = 20, -- The Z-index of the context window
				on_attach = nil, -- (fun(buf: integer): boolean) return false to disable attaching
			})
		end,
	},

	{ "famiu/bufdelete.nvim", event = "VeryLazy" },

	{
		"echasnovski/mini.files",
		version = "*",
		config = function()
			local MiniFiles = require("mini.files")

			local my_prefix = function(fs_entry)
				if fs_entry.fs_type == "directory" then
					-- NOTE: it is usually a good idea to use icon followed by space
					return " ", "MiniFilesDirectory"
				end
				return MiniFiles.default_prefix(fs_entry)
			end

			require("mini.files").setup({
				-- content = { prefix = my_prefix },
				mappings = {
					close = "q",
					go_in = "l",
					go_in_plus = "L",
					go_out = "h",
					go_out_plus = "H",
					mark_goto = "'",
					mark_set = "m",
					reset = "<BS>",
					reveal_cwd = "@",
					show_help = "g?",
					synchronize = "<leader>s",
					trim_left = "<",
					trim_right = ">",
				},
				windows = {
					-- Maximum number of windows to show side by side
					max_number = 4,
					-- Whether to show preview of file/directory under cursor
					preview = true,
					-- Width of focused window
					width_focus = 25,
					-- Width of non-focused window
					width_nofocus = 20,
					-- Width of preview window
					width_preview = 80,
				},
			})

			-- Custom behavior: open file and then close picker
			local files = require("mini.files")
			vim.api.nvim_create_autocmd("User", {
				pattern = "MiniFilesBufferCreate",
				callback = function(args)
					local buf_id = args.data.buf_id
					vim.keymap.set("n", "l", function()
						local cur_entry = files.get_fs_entry()
						if cur_entry == nil then
							return
						end
						if cur_entry.fs_type == "directory" then
							files.go_in()
						else
							files.go_in()
							files.close()
						end
					end, { buffer = buf_id })
				end,
			})

			vim.keymap.set("n", "<leader>e", function()
				local _ = MiniFiles.close() or MiniFiles.open(vim.api.nvim_buf_get_name(0), false)
				MiniFiles.reveal_cwd()
			end)
		end,
	},

	{ "itchyny/calendar.vim", event = "VeryLazy" },
	{ import = "plugins" },
})

-- The line beneath this is called `modeline`. See `:help modeline`
-- vim: ts=2 sts=2 sw=2 et
--
vim.cmd("colorscheme oxocarbon")

-- exit terminal mode when trying to scroll up/down page
vim.keymap.set("t", "<C-d>", "<C-\\><C-n>", {
	desc = "Exit terminal mode",
})
vim.keymap.set("t", "<C-u>", "<C-\\><C-n>", {
	desc = "Exit terminal mode",
})
-- exit terminal keymap
vim.keymap.set("t", "<c-x>", "<C-\\><C-n>", { silent = true })

-- pressing r and i which don't work in the terminal move to insert mode
vim.keymap.set("n", "r", function()
	local bufname = vim.api.nvim_buf_get_name(0)
	local terminalname = "term://"

	if string.sub(bufname, 1, #terminalname) == terminalname then
		vim.api.nvim_command("normal a")
	else
		-- Use vim.api.nvim_feedkeys to send the original 'r' command
		vim.api.nvim_feedkeys("r", "n", false)
	end
end)
vim.keymap.set("n", "i", function()
	local bufname = vim.api.nvim_buf_get_name(0)
	local terminalname = "term://"

	if string.sub(bufname, 1, #terminalname) == terminalname then
		vim.api.nvim_command("normal a")
	else
		-- Use vim.api.nvim_feedkeys to send the original 'i' command
		vim.api.nvim_feedkeys("i", "n", false)
	end
end)
vim.keymap.set("n", "<C-c>", function()
	local bufname = vim.api.nvim_buf_get_name(0)
	local terminalname = "term://"

	if string.sub(bufname, 1, #terminalname) == terminalname then
		vim.api.nvim_command("normal a")
	else
		-- Use vim.api.nvim_feedkeys to send the original '<C-c>' command
		vim.api.nvim_feedkeys("<C-c>", "n", false)
	end
end)

require("features/auto-open-files")
