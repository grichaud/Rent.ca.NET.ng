using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Rent.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTiersExpiresAndSpecialsAndSearches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TierExpiresAt",
                table: "Properties",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TierExpiresAt",
                table: "LandlordProfiles",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PopularSearches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    NormalizedQuery = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CitySlug = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false, defaultValue: ""),
                    SearchCount = table.Column<int>(type: "int", nullable: false),
                    LastSearchedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PopularSearches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RentSpecials",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PropertyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    StartDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    EndDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RentSpecials", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RentSpecials_Properties_PropertyId",
                        column: x => x.PropertyId,
                        principalTable: "Properties",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Properties_TierExpiresAt",
                table: "Properties",
                column: "TierExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_PopularSearches_NormalizedQuery_CitySlug",
                table: "PopularSearches",
                columns: new[] { "NormalizedQuery", "CitySlug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PopularSearches_SearchCount_LastSearchedAt",
                table: "PopularSearches",
                columns: new[] { "SearchCount", "LastSearchedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RentSpecials_PropertyId_IsActive_EndDate",
                table: "RentSpecials",
                columns: new[] { "PropertyId", "IsActive", "EndDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PopularSearches");

            migrationBuilder.DropTable(
                name: "RentSpecials");

            migrationBuilder.DropIndex(
                name: "IX_Properties_TierExpiresAt",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "TierExpiresAt",
                table: "Properties");

            migrationBuilder.DropColumn(
                name: "TierExpiresAt",
                table: "LandlordProfiles");
        }
    }
}
