const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: {
        background: './src/background.js',
        popup: './src/popup/popup.js'
    },
    output: {
        filename: (pathData) => {
            return pathData.chunk.name === 'background' 
                ? '[name].bundle.js' 
                : 'popup/[name].bundle.js';
        },
        path: path.resolve(__dirname, 'dist'),
        clean: true
    },
    optimization: {
        minimize: false
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "manifest.json", to: "manifest.json" },
                { from: "public/images", to: "images" },
                { 
                    from: "src/popup/popup.html", 
                    to: "popup/popup.html",
                    transform(content) {
                        return content.toString().replace(
                            'popup.js',
                            'popup.bundle.js'
                        );
                    }
                },
                {
                    from: "src/popup/popup.css",
                    to: "popup/popup.css"
                }
            ],
        }),
    ],
    resolve: {
        extensions: ['.js', '.jsx'],
        alias: {
            'spotify-web-api-node': path.resolve(__dirname, 'node_modules/spotify-web-api-node/src/spotify-web-api.js')
        }
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules\/(?!spotify-web-api-node\/src)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: {
                                    chrome: "88"
                                }
                            }]
                        ]
                    }
                }
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    }
};